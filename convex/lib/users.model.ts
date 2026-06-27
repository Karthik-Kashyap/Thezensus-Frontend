// Users-domain data access (PII-free, keyed by linkId): the profile/stats/demographics/
// settings/moderation docs that DDB held as one Users partition. Reads compose them into
// a UserAggregate; writes patch the owning doc only.

import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { generateHandleCandidate } from "./handles.logic";
import { HANDLE_MAX_ATTEMPTS } from "./constants/handles";

type Ctx = QueryCtx | MutationCtx;

/**
 * Allocate a unique cosmos handle (`Pulsar-4821`). Random candidate → by_handle lookup →
 * retry on collision, widening the discriminator as attempts climb (handles.logic). Uniqueness
 * is guaranteed: this runs inside the signup transaction, so a concurrent identical insert
 * lands in the same read/write set and OCC retries the loser, which then sees the taken handle.
 * Reads reflect writes earlier in the same mutation, so backfilling many in one pass is safe too.
 */
export async function assignUniqueHandle(ctx: MutationCtx): Promise<string> {
  for (let attempt = 0; attempt < HANDLE_MAX_ATTEMPTS; attempt++) {
    const candidate = generateHandleCandidate(attempt);
    const taken = await ctx.db
      .query("users")
      .withIndex("by_handle", (q) => q.eq("handle", candidate))
      .unique();
    if (!taken) return candidate;
  }
  throw new Error("Could not allocate a unique handle after maximum attempts");
}

export interface UserAggregate {
  profile: Doc<"users"> | null;
  stats: Doc<"userStats"> | null;
  demographics: Doc<"userDemographics"> | null;
  settings: Doc<"userSettings"> | null;
  moderation: Doc<"userModeration"> | null;
}

const byLinkId = <T extends "userStats" | "userDemographics" | "userSettings" | "userModeration">(
  ctx: Ctx,
  table: T,
  linkId: string,
) =>
  ctx.db
    .query(table)
    // Every table in T has `linkId: string` and a by_linkId index, but TS can't
    // resolve the field type across the generic union — hence the cast.
    .withIndex("by_linkId", (q) => q.eq("linkId", linkId as never))
    .unique();

/** linkId ≡ users._id, so the profile is a point read. normalizeId rejects garbage
 *  subjects (stale/foreign tokens) as a plain not-found instead of throwing. */
export async function getProfile(ctx: Ctx, linkId: string): Promise<Doc<"users"> | null> {
  const id = ctx.db.normalizeId("users", linkId);
  return id ? await ctx.db.get(id) : null;
}

export async function getModeration(ctx: Ctx, linkId: string): Promise<Doc<"userModeration"> | null> {
  return await byLinkId(ctx, "userModeration", linkId);
}

/** Point read for the vote path's consented demographics snapshot (avoids the full aggregate). */
export async function getDemographics(ctx: Ctx, linkId: string): Promise<Doc<"userDemographics"> | null> {
  return await byLinkId(ctx, "userDemographics", linkId);
}

/** Everything about one user (the DDB "query the partition" read). */
export async function getUserAggregate(ctx: Ctx, linkId: string): Promise<UserAggregate> {
  const [profile, stats, demographics, settings, moderation] = await Promise.all([
    getProfile(ctx, linkId),
    byLinkId(ctx, "userStats", linkId),
    byLinkId(ctx, "userDemographics", linkId),
    byLinkId(ctx, "userSettings", linkId),
    byLinkId(ctx, "userModeration", linkId),
  ]);
  return { profile, stats, demographics, settings, moderation };
}

// ── Stats counters (DESIGN-011) ─────────────────────────────────────────────

/**
 * Add signed deltas to a user's profile counters (the canonical helper for all three).
 * Read-modify-write of the user's OWN `userStats` doc:
 *   • `pollsCreated`   — bumped by polls.ts create (own doc, low-rate).
 *   • `votesCast`      — bumped by votes.ts cast for attributable votes (voter's own doc).
 *   • `totalVotesReceived` — bumped by the tally drain (tally.ts publishBallot) by the
 *     per-publish delta, NEVER on the vote path (that single creator doc would be the
 *     write hotspot the tally exists to avoid). No-op if the doc is absent (deleted user).
 */
export async function bumpUserStats(
  ctx: MutationCtx,
  linkId: string,
  delta: { pollsCreated?: number; votesCast?: number; totalVotesReceived?: number },
): Promise<void> {
  const doc = await byLinkId(ctx, "userStats", linkId);
  if (!doc) return;
  await ctx.db.patch(doc._id, {
    pollsCreated: doc.pollsCreated + (delta.pollsCreated ?? 0),
    votesCast: doc.votesCast + (delta.votesCast ?? 0),
    totalVotesReceived: doc.totalVotesReceived + (delta.totalVotesReceived ?? 0),
  });
}

// ── Writes (patch only the fields provided; undefined = leave unchanged) ─────

export interface ProfilePatch {
  bio?: string;
  avatarMediaId?: string;
  avatarKey?: string;
}

export async function updateProfile(ctx: MutationCtx, linkId: string, patch: ProfilePatch): Promise<void> {
  const doc = await getProfile(ctx, linkId);
  if (!doc) return;
  const defined = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  if (Object.keys(defined).length > 0) await ctx.db.patch(doc._id, defined);
}

export interface DemographicsPatch {
  gender?: string;
  country?: string;
  state?: string;
  birthYear?: number;
  demographicsPublic?: boolean;
  demographicsConsent?: boolean;
}

export async function updateDemographics(
  ctx: MutationCtx,
  linkId: string,
  patch: DemographicsPatch,
): Promise<void> {
  const doc = await byLinkId(ctx, "userDemographics", linkId);
  if (!doc) return;
  const defined = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  if (Object.keys(defined).length > 0) await ctx.db.patch(doc._id, defined);
}

export async function updateSettings(
  ctx: MutationCtx,
  linkId: string,
  patch: { notifPrefs?: string[] },
): Promise<void> {
  if (patch.notifPrefs === undefined) return;
  const doc = await byLinkId(ctx, "userSettings", linkId);
  if (doc) await ctx.db.patch(doc._id, { notifPrefs: patch.notifPrefs });
}

// ── Account creation (the per-table inserts of the signup transaction) ───────

export interface InsertUserItemsInput {
  demographicsConsent: boolean;
  birthYear?: number; // written only with demographics consent
}

/** Inserts the users doc FIRST — its `_id` is the account's brand-new linkId — then the
 *  satellite docs keyed by it. The public identity is an auto-generated handle (no real name).
 *  Returns the linkId for the vault row + session. */
export async function insertUserItems(ctx: MutationCtx, input: InsertUserItemsInput): Promise<string> {
  const { demographicsConsent, birthYear } = input;
  const handle = await assignUniqueHandle(ctx);
  const linkId = await ctx.db.insert("users", { handle });
  await ctx.db.insert("userStats", { linkId, pollsCreated: 0, totalVotesReceived: 0, votesCast: 0 });
  await ctx.db.insert("userDemographics", {
    linkId,
    demographicsPublic: false,
    demographicsConsent,
    // birthYear is consented analytics data — written only with demographics consent.
    ...(demographicsConsent && birthYear !== undefined ? { birthYear } : {}),
  });
  await ctx.db.insert("userSettings", { linkId, notifPrefs: ["email"] });
  return linkId;
}
