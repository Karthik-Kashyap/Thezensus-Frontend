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
import { shardFor } from "./tally.logic";

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
 * Register a ballot in a CLEAN state (`dirtySince = 0`). Used by the seed path, which
 * publishes editionResults directly — there's no backlog to fold, so the row starts clean.
 * The live vote path does NOT use this; it registers-dirty-and-arms via `noteVote`
 * (tally.ts). Insert-only: existing rows are read but never rewritten here.
 */
export async function ensureRegistered(
  ctx: MutationCtx,
  ballotKey: string,
  pollId: string,
  creatorId: string,
): Promise<void> {
  const existing = await getRegistryEntry(ctx, ballotKey);
  if (!existing) {
    await ctx.db.insert("tallyRegistry", {
      ballotKey,
      pollId,
      creatorId, // denormalized for the drain's totalVotesReceived roll-up (DESIGN-011)
      shard: shardFor(ballotKey),
      dirtySince: 0,
    });
  }
}

// ── Tally scheduler: dirty-set + shard control (DESIGN-009) ──────────────────

/** A shard's coalescing control row (the "is a drain queued?" flag). */
export async function getControl(ctx: Ctx, shard: number): Promise<Doc<"tallyControl"> | null> {
  return await ctx.db
    .query("tallyControl")
    .withIndex("by_shard", (q) => q.eq("shard", shard))
    .unique();
}

/**
 * The oldest-dirtied ballotKeys of one shard, FIFO (dirtySince ascending). Reads EXACTLY
 * the dirty slice via `eq(shard).gt(dirtySince, 0)` — never the whole registry.
 */
export async function claimDirtyBallots(ctx: Ctx, shard: number, limit: number): Promise<string[]> {
  const rows = await ctx.db
    .query("tallyRegistry")
    .withIndex("by_shard_dirty", (q) => q.eq("shard", shard).gt("dirtySince", 0))
    .order("asc")
    .take(limit);
  return rows.map((r) => r.ballotKey);
}

/** Whether a shard has any dirty ballot (existence probe for rearm/sweep). */
export async function hasDirtyBallot(ctx: Ctx, shard: number): Promise<boolean> {
  const first = await ctx.db
    .query("tallyRegistry")
    .withIndex("by_shard_dirty", (q) => q.eq("shard", shard).gt("dirtySince", 0))
    .first();
  return first !== null;
}

/** The newest event on a ballot — the single-row tail read that closes the snapshot→publish gap. */
export async function latestVoteEvent(ctx: Ctx, ballotKey: string): Promise<Doc<"voteEvents"> | null> {
  return await ctx.db
    .query("voteEvents")
    .withIndex("by_ballot", (q) => q.eq("ballotKey", ballotKey))
    .order("desc")
    .first();
}
