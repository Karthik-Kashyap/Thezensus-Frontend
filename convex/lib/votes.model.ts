// Votes-domain data access: the ballot box (`votes`), the append-only tally feed
// (`voteEvents`), the published scoreboard (`editionResults`) and the tally's private
// state (`tallyState`, `tallyRegistry`). The WRITE RULES here are the load-tested core
// of the platform (REVIEW-002, gate run 2026-06-10) — read before changing:
//
//   1. The vote path inserts/patches voter-owned rows only; it NEVER touches
//      tallyState or editionResults (zero shared docs → zero OCC at 850/s).
//   2. The tally is the single writer of tallyState + editionResults.
//   3. The tally tails voteEvents by `_creationTime` watermark — never a persisted
//      `.paginate` cursor (end-cursors silently miss later inserts; finding 6).

import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";

type Ctx = QueryCtx | MutationCtx;

// ── Ballot box ───────────────────────────────────────────────────────────────

export async function getVote(
  ctx: Ctx,
  ballotKey: string,
  voter: string,
): Promise<Doc<"votes"> | null> {
  return await ctx.db
    .query("votes")
    .withIndex("by_ballot_voter", (q) => q.eq("ballotKey", ballotKey).eq("voter", voter))
    .unique();
}

export interface InsertVoteInput {
  ballotKey: string;
  voter: string;
  optionId: string;
  trust: "valid" | "suspect" | "invalid";
  linkId?: string; // attributable votes only (sparse — deletion enumerates it)
  guestName?: string;
  demographics?: {
    gender?: string;
    ageAtVote?: number;
    region?: string;
    segments?: Record<string, string>;
  };
}

export async function insertVote(ctx: MutationCtx, input: InsertVoteInput): Promise<void> {
  await ctx.db.insert("votes", { ...input, votedAt: Date.now(), version: 1 });
}

export async function changeVoteRow(
  ctx: MutationCtx,
  vote: Doc<"votes">,
  newOptionId: string,
): Promise<void> {
  await ctx.db.patch(vote._id, {
    optionId: newOptionId,
    votedAt: Date.now(),
    version: vote.version + 1,
  });
}

// ── Tally feed (append-only; NO voter identity by design — ADR-007) ─────────

export async function insertVoteEvent(
  ctx: MutationCtx,
  ballotKey: string,
  optionId: string,
  delta: 1 | -1,
  dims?: string[],
  segKey?: string,
): Promise<void> {
  await ctx.db.insert("voteEvents", { ballotKey, optionId, delta, dims, segKey });
}

/** One watermark-bounded page of the tally feed, oldest-first. */
export async function voteEventsSince(
  ctx: Ctx,
  ballotKey: string,
  watermark: number,
  pageSize: number,
): Promise<Doc<"voteEvents">[]> {
  return await ctx.db
    .query("voteEvents")
    .withIndex("by_ballot", (q) => q.eq("ballotKey", ballotKey).gt("_creationTime", watermark))
    .order("asc")
    .take(pageSize);
}

// ── Published results + tally state (single-writer side) ────────────────────

export async function getResults(ctx: Ctx, ballotKey: string): Promise<Doc<"editionResults"> | null> {
  return await ctx.db
    .query("editionResults")
    .withIndex("by_ballot", (q) => q.eq("ballotKey", ballotKey))
    .unique();
}

export async function getTallyState(ctx: Ctx, ballotKey: string): Promise<Doc<"tallyState"> | null> {
  return await ctx.db
    .query("tallyState")
    .withIndex("by_ballot", (q) => q.eq("ballotKey", ballotKey))
    .unique();
}

export async function getRegistryEntry(
  ctx: Ctx,
  ballotKey: string,
): Promise<Doc<"tallyRegistry"> | null> {
  return await ctx.db
    .query("tallyRegistry")
    .withIndex("by_ballot", (q) => q.eq("ballotKey", ballotKey))
    .unique();
}

/**
 * Called by the FIRST vote on an edition (insert-only; existing rows are read but never
 * rewritten, so votes can't OCC-contend on it). Registers the ballot for tally scans.
 */
export async function ensureRegistered(
  ctx: MutationCtx,
  ballotKey: string,
  pollId: string,
): Promise<void> {
  const existing = await getRegistryEntry(ctx, ballotKey);
  if (!existing) await ctx.db.insert("tallyRegistry", { ballotKey, pollId });
}

export async function listRegistry(ctx: Ctx): Promise<Doc<"tallyRegistry">[]> {
  return await ctx.db.query("tallyRegistry").collect();
}
