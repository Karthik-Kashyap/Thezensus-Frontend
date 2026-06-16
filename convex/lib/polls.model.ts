// Polls-domain data access: the `polls` and `editions` tables. Counts are NOT here —
// they live in `editionResults`, written only by the tally (votes.model).

import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { EDITION_STATUS, POLL_AUDIENCE, POLL_STATUS } from "./constants/poll";

type Ctx = QueryCtx | MutationCtx;

export async function getPoll(ctx: Ctx, pollId: string): Promise<Doc<"polls"> | null> {
  return await ctx.db
    .query("polls")
    .withIndex("by_pollId", (q) => q.eq("pollId", pollId))
    .unique();
}

export async function getEdition(
  ctx: Ctx,
  pollId: string,
  label: string,
): Promise<Doc<"editions"> | null> {
  return await ctx.db
    .query("editions")
    .withIndex("by_poll_label", (q) => q.eq("pollId", pollId).eq("label", label))
    .unique();
}

/**
 * Lazy edition creation on first vote (legacy ensureEdition). A concurrent double-create
 * is prevented by OCC on the by_poll_label range read + insert (conditional-put
 * semantics, REVIEW-002 finding 4).
 */
export async function ensureEdition(
  ctx: MutationCtx,
  pollId: string,
  label: string,
): Promise<Doc<"editions">> {
  const existing = await getEdition(ctx, pollId, label);
  if (existing) return existing;
  const id = await ctx.db.insert("editions", { pollId, label, status: EDITION_STATUS.OPEN });
  return (await ctx.db.get(id))!;
}

/** Newest-first pages for the community / creator feeds (callers filter visibility). */
export function pollsByCommunity(ctx: Ctx, communityId: string) {
  return ctx.db
    .query("polls")
    .withIndex("by_community", (q) => q.eq("communityId", communityId))
    .order("desc");
}

export function pollsByCreator(ctx: Ctx, creatorId: string) {
  return ctx.db
    .query("polls")
    .withIndex("by_creator", (q) => q.eq("creatorId", creatorId))
    .order("desc");
}

/** The discover source (recency strategy): listable polls only, newest-first. The
 *  index pins COMMUNITY + ACTIVE; callers still filter takedowns + private visibility. */
export function pollsDiscoverable(ctx: Ctx) {
  return ctx.db
    .query("polls")
    .withIndex("by_audience_status", (q) =>
      q.eq("audienceType", POLL_AUDIENCE.COMMUNITY).eq("status", POLL_STATUS.ACTIVE),
    )
    .order("desc");
}
