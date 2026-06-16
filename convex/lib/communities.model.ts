// Communities-domain data access: profile, roles, bans, pins, subscriptions. The
// poll/vote domains use the point reads (membership/role/ban) to gate access; the
// community controllers use the rest. subscriberCount is a best-effort read-modify-
// write counter (fine at these rates — NEVER do this in the vote path, REVIEW-002).

import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";

type Ctx = QueryCtx | MutationCtx;

export async function getCommunity(ctx: Ctx, communityId: string): Promise<Doc<"communities"> | null> {
  return await ctx.db
    .query("communities")
    .withIndex("by_communityId", (q) => q.eq("communityId", communityId))
    .unique();
}

/** Communities for the discover/browse list. No visibility/subscriberCount index exists,
 *  so this scans (bounded by `scanCap`) and leaves filtering + sorting to the caller. Fine at
 *  current scale; add a dedicated index if the directory ever outgrows the cap. */
export async function listCommunities(ctx: Ctx, scanCap: number): Promise<Doc<"communities">[]> {
  return await ctx.db.query("communities").take(scanCap);
}

export async function getSubscription(
  ctx: Ctx,
  linkId: string,
  communityId: string,
): Promise<Doc<"subscriptions"> | null> {
  return await ctx.db
    .query("subscriptions")
    .withIndex("by_user_community", (q) => q.eq("linkId", linkId).eq("communityId", communityId))
    .unique();
}

export async function isMember(ctx: Ctx, linkId: string, communityId: string): Promise<boolean> {
  return (await getSubscription(ctx, linkId, communityId)) !== null;
}

/** OWNER/MODERATOR grant within one community, or null. */
export async function getRole(
  ctx: Ctx,
  linkId: string,
  communityId: string,
): Promise<Doc<"communityRoles"> | null> {
  return await ctx.db
    .query("communityRoles")
    .withIndex("by_community_user", (q) => q.eq("communityId", communityId).eq("linkId", linkId))
    .unique();
}

export async function isOwnerOrMod(ctx: Ctx, linkId: string, communityId: string): Promise<boolean> {
  return (await getRole(ctx, linkId, communityId)) !== null;
}

export async function getBan(
  ctx: Ctx,
  linkId: string,
  communityId: string,
): Promise<Doc<"communityBans"> | null> {
  return await ctx.db
    .query("communityBans")
    .withIndex("by_community_user", (q) => q.eq("communityId", communityId).eq("linkId", linkId))
    .unique();
}

export async function isBannedFromCommunity(
  ctx: Ctx,
  linkId: string,
  communityId: string,
): Promise<boolean> {
  return (await getBan(ctx, linkId, communityId)) !== null;
}

// ── Phase 3: full domain access ──────────────────────────────────────────────

export async function listRoles(ctx: Ctx, communityId: string): Promise<Doc<"communityRoles">[]> {
  return await ctx.db
    .query("communityRoles")
    .withIndex("by_community", (q) => q.eq("communityId", communityId))
    .collect();
}

export async function listBans(ctx: Ctx, communityId: string): Promise<Doc<"communityBans">[]> {
  return await ctx.db
    .query("communityBans")
    .withIndex("by_community", (q) => q.eq("communityId", communityId))
    .collect();
}

export async function listPins(ctx: Ctx, communityId: string): Promise<Doc<"communityPins">[]> {
  return await ctx.db
    .query("communityPins")
    .withIndex("by_community", (q) => q.eq("communityId", communityId))
    .collect();
}

export async function getPin(
  ctx: Ctx,
  communityId: string,
  pollId: string,
): Promise<Doc<"communityPins"> | null> {
  return await ctx.db
    .query("communityPins")
    .withIndex("by_community_poll", (q) => q.eq("communityId", communityId).eq("pollId", pollId))
    .unique();
}

export async function listSubscriptionsByUser(
  ctx: Ctx,
  linkId: string,
): Promise<Doc<"subscriptions">[]> {
  return await ctx.db
    .query("subscriptions")
    .withIndex("by_user_community", (q) => q.eq("linkId", linkId))
    .collect();
}

/** Best-effort subscriber counter (read-modify-write; approximate by design). */
export async function bumpSubscriberCount(
  ctx: MutationCtx,
  community: Doc<"communities">,
  delta: 1 | -1,
): Promise<void> {
  await ctx.db.patch(community._id, {
    subscriberCount: Math.max(0, community.subscriberCount + delta),
  });
}
