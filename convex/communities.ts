// Communities API — the community-service surface. Thin controllers: arg validation +
// actor resolution here; behavior in lib/communities.logic; data access in
// lib/communities.model. DTOs mirror src/lib/types.ts (Community / Subscription /
// RoleView / BanView).

import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { optionalActor, requireActor, type Actor } from "./lib/actor";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { badRequest, notFound, forbidden, conflict } from "./lib/errors";
import { newCommunityId } from "./lib/ids";
import { COMMUNITY_ROLE, COMMUNITY_LIMITS, DEFAULT_COMMUNITY_VISIBILITY } from "./lib/constants/community";
import { MEDIA_KIND, MEDIA_STATUS } from "./lib/constants/media";
import {
  validateName,
  validateDescription,
  validateRules,
  validateCommunityTagsCategory,
  validateSegments,
  validateSegmentAnswers,
  toCommunityDetail,
  toCommunitySummary,
  toSubscriptionView,
  toRoleView,
  toBanView,
} from "./lib/communities.logic";
import {
  getCommunity,
  getRole,
  getBan,
  getPin,
  getSubscription,
  listRoles,
  listBans,
  listCommunities,
  listSubscriptionsByUser,
  bumpSubscriberCount,
} from "./lib/communities.model";
import { getPoll } from "./lib/polls.model";
import { getMedia } from "./lib/media.model";

const segmentDefInput = v.object({
  id: v.string(),
  label: v.string(),
  options: v.array(v.string()),
  version: v.optional(v.number()),
});

// ── Local authz helpers (point reads; the service re-checks on every call) ──

async function requireCommunity(
  ctx: QueryCtx | MutationCtx,
  communityId: string,
): Promise<Doc<"communities">> {
  const community = await getCommunity(ctx, communityId);
  if (!community) throw notFound("Community not found");
  return community;
}

async function requireOwner(
  ctx: QueryCtx | MutationCtx,
  actor: Actor,
  communityId: string,
): Promise<void> {
  const role = await getRole(ctx, actor.linkId, communityId);
  if (role?.role !== COMMUNITY_ROLE.OWNER) throw forbidden("Owner only");
}

async function requireOwnerOrMod(
  ctx: QueryCtx | MutationCtx,
  actor: Actor,
  communityId: string,
): Promise<Doc<"communityRoles">> {
  const role = await getRole(ctx, actor.linkId, communityId);
  if (!role) throw forbidden("Owner or moderator only");
  return role;
}

/** POST /communities — create; caller becomes OWNER. */
export const create = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    visibility: v.optional(
      v.union(v.literal("public"), v.literal("protected"), v.literal("private")),
    ),
    tags: v.optional(v.array(v.string())),
    category: v.optional(v.string()),
    rules: v.optional(v.string()),
    iconMediaId: v.optional(v.string()),
    segments: v.optional(v.array(segmentDefInput)),
  },
  handler: async (ctx, input) => {
    const actor = await requireActor(ctx);

    const name = validateName(input.name);
    const description = input.description !== undefined ? validateDescription(input.description) : undefined;
    const rules = input.rules !== undefined ? validateRules(input.rules) : undefined;
    validateCommunityTagsCategory(input.tags, input.category);
    const segments = input.segments !== undefined ? validateSegments(input.segments) : undefined;

    const communityId = newCommunityId();
    await ctx.db.insert("communities", {
      communityId,
      name,
      ...(description !== undefined ? { description } : {}),
      visibility: input.visibility ?? DEFAULT_COMMUNITY_VISIBILITY,
      subscriberCount: 0,
      ...(input.tags !== undefined ? { tags: input.tags } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(rules !== undefined ? { rules } : {}),
      ...(segments !== undefined ? { segments } : {}),
      createdBy: actor.linkId,
    });
    await ctx.db.insert("communityRoles", {
      communityId,
      linkId: actor.linkId,
      role: COMMUNITY_ROLE.OWNER,
      // founding owner: no grantedBy
    });

    const community = (await getCommunity(ctx, communityId))!;
    return await toCommunityDetail(ctx, community, actor.linkId);
  },
});

/** GET /communities/:id — always viewable; myRole included for the signed-in caller. */
export const get = query({
  args: { communityId: v.string() },
  handler: async (ctx, { communityId }) => {
    const actor = await optionalActor(ctx);
    const community = await requireCommunity(ctx, communityId);
    return await toCommunityDetail(ctx, community, actor?.linkId ?? null);
  },
});

/** PATCH /communities/:id — owner/mod for content; OWNER ONLY for visibility/segments/icon. */
export const update = mutation({
  args: {
    communityId: v.string(),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    visibility: v.optional(
      v.union(v.literal("public"), v.literal("protected"), v.literal("private")),
    ),
    tags: v.optional(v.array(v.string())),
    category: v.optional(v.string()),
    rules: v.optional(v.string()),
    iconMediaId: v.optional(v.string()),
    segments: v.optional(v.array(segmentDefInput)),
  },
  handler: async (ctx, input) => {
    const actor = await requireActor(ctx);
    const community = await requireCommunity(ctx, input.communityId);
    await requireOwnerOrMod(ctx, actor, input.communityId);

    const ownerOnly =
      input.visibility !== undefined || input.segments !== undefined || input.iconMediaId !== undefined;
    if (ownerOnly) await requireOwner(ctx, actor, input.communityId);

    const patch: Record<string, unknown> = {};
    if (input.name !== undefined) patch.name = validateName(input.name);
    if (input.description !== undefined) patch.description = validateDescription(input.description);
    if (input.rules !== undefined) patch.rules = validateRules(input.rules);
    validateCommunityTagsCategory(input.tags, input.category);
    if (input.tags !== undefined) patch.tags = input.tags;
    if (input.category !== undefined) patch.category = input.category;
    if (input.visibility !== undefined) patch.visibility = input.visibility;
    if (input.segments !== undefined) patch.segments = validateSegments(input.segments);

    if (input.iconMediaId !== undefined) {
      const media = await getMedia(ctx, community.communityId, input.iconMediaId);
      if (!media) throw badRequest("Icon media not found for this community");
      if (media.kind !== MEDIA_KIND.COMMUNITY_ICON) throw badRequest("Media is not a community icon");
      if (media.status !== MEDIA_STATUS.READY || !media.servingKey) throw badRequest("Icon media is not ready");
      patch.iconMediaId = input.iconMediaId;
      patch.iconKey = media.servingKey;
    }

    if (Object.keys(patch).length === 0) throw badRequest("Nothing to update");
    await ctx.db.patch(community._id, patch);

    const fresh = (await getCommunity(ctx, community.communityId))!;
    return await toCommunityDetail(ctx, fresh, actor.linkId);
  },
});

// ── Subscriptions ────────────────────────────────────────────────────────────

/** POST /communities/:id/subscription — join (with optional segment answers). */
export const subscribe = mutation({
  args: { communityId: v.string(), segments: v.optional(v.record(v.string(), v.string())) },
  handler: async (ctx, { communityId, segments }) => {
    const actor = await requireActor(ctx);
    const community = await requireCommunity(ctx, communityId);
    if (await getBan(ctx, actor.linkId, communityId)) {
      throw forbidden("You are banned from this community");
    }
    if (await getSubscription(ctx, actor.linkId, communityId)) {
      throw conflict("Already subscribed");
    }
    if (segments) validateSegmentAnswers(community, segments);

    const id = await ctx.db.insert("subscriptions", {
      linkId: actor.linkId,
      communityId,
      ...(segments && Object.keys(segments).length > 0 ? { segments } : {}),
    });
    await bumpSubscriberCount(ctx, community, 1);
    return toSubscriptionView((await ctx.db.get(id))!);
  },
});

/** DELETE /communities/:id/subscription — leave. */
export const unsubscribe = mutation({
  args: { communityId: v.string() },
  handler: async (ctx, { communityId }) => {
    const actor = await requireActor(ctx);
    const community = await requireCommunity(ctx, communityId);
    const sub = await getSubscription(ctx, actor.linkId, communityId);
    if (!sub) throw notFound("Not subscribed");
    await ctx.db.delete(sub._id);
    await bumpSubscriberCount(ctx, community, -1);
    return null;
  },
});

/** GET /communities/:id/subscription — own membership, or null when not subscribed. */
export const getMySubscription = query({
  args: { communityId: v.string() },
  handler: async (ctx, { communityId }) => {
    const actor = await requireActor(ctx);
    const sub = await getSubscription(ctx, actor.linkId, communityId);
    // "Not subscribed" is a normal answer, not an error — return null so callers don't
    // catch-on-404 and the Convex log isn't spammed (this query runs per feed card now).
    return sub ? toSubscriptionView(sub) : null;
  },
});

/** GET /subscriptions — everything the caller subscribes to (sidebar + home feed). */
export const listMySubscriptions = query({
  args: {},
  handler: async (ctx) => {
    const actor = await requireActor(ctx);
    const subs = await listSubscriptionsByUser(ctx, actor.linkId);
    return subs.map(toSubscriptionView);
  },
});

/** GET /communities/discover — public communities the caller hasn't joined, most-subscribed
 *  first. Drives the sidebar "Discover communities" list. Signed-out callers just get the most
 *  popular public ones (nothing filtered out). */
export const listDiscoverable = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const actor = await optionalActor(ctx);
    const joined = actor
      ? new Set((await listSubscriptionsByUser(ctx, actor.linkId)).map((s) => s.communityId))
      : new Set<string>();
    const communities = await listCommunities(ctx, 200);
    return communities
      .filter((c) => c.visibility === "public" && !joined.has(c.communityId))
      .sort((a, b) => b.subscriberCount - a.subscriberCount)
      .slice(0, limit ?? 8)
      .map(toCommunitySummary);
  },
});

// ── Roles (owner manages; owner/mod views) ──────────────────────────────────

/** GET /communities/:id/roles */
export const listCommunityRoles = query({
  args: { communityId: v.string() },
  handler: async (ctx, { communityId }) => {
    const actor = await requireActor(ctx);
    await requireCommunity(ctx, communityId);
    await requireOwnerOrMod(ctx, actor, communityId);
    return (await listRoles(ctx, communityId)).map(toRoleView);
  },
});

/** PUT /communities/:id/roles/:linkId — owner grants MODERATOR. */
export const addModerator = mutation({
  args: { communityId: v.string(), linkId: v.string() },
  handler: async (ctx, { communityId, linkId }) => {
    const actor = await requireActor(ctx);
    await requireCommunity(ctx, communityId);
    await requireOwner(ctx, actor, communityId);
    if (await getBan(ctx, linkId, communityId)) throw conflict("User is banned from this community");
    if (await getRole(ctx, linkId, communityId)) throw conflict("User already has a role");

    const id = await ctx.db.insert("communityRoles", {
      communityId,
      linkId,
      role: COMMUNITY_ROLE.MODERATOR,
      grantedBy: actor.linkId,
    });
    return toRoleView((await ctx.db.get(id))!);
  },
});

/** DELETE /communities/:id/roles/:linkId — owner revokes a moderator (never the owner). */
export const removeModerator = mutation({
  args: { communityId: v.string(), linkId: v.string() },
  handler: async (ctx, { communityId, linkId }) => {
    const actor = await requireActor(ctx);
    await requireCommunity(ctx, communityId);
    await requireOwner(ctx, actor, communityId);
    const role = await getRole(ctx, linkId, communityId);
    if (!role) throw notFound("No role to remove");
    if (role.role === COMMUNITY_ROLE.OWNER) throw badRequest("The owner role can't be removed");
    await ctx.db.delete(role._id);
    return null;
  },
});

// ── Bans (owner/mod) ─────────────────────────────────────────────────────────

/** GET /communities/:id/bans */
export const listCommunityBans = query({
  args: { communityId: v.string() },
  handler: async (ctx, { communityId }) => {
    const actor = await requireActor(ctx);
    await requireCommunity(ctx, communityId);
    await requireOwnerOrMod(ctx, actor, communityId);
    return (await listBans(ctx, communityId)).map(toBanView);
  },
});

/** PUT /communities/:id/bans/:linkId */
export const banMember = mutation({
  args: { communityId: v.string(), linkId: v.string(), reason: v.optional(v.string()) },
  handler: async (ctx, { communityId, linkId, reason }) => {
    const actor = await requireActor(ctx);
    await requireCommunity(ctx, communityId);
    await requireOwnerOrMod(ctx, actor, communityId);
    if (reason !== undefined && reason.length > COMMUNITY_LIMITS.banReasonMax) {
      throw badRequest("Ban reason too long");
    }
    if (linkId === actor.linkId) throw badRequest("You can't ban yourself");
    const targetRole = await getRole(ctx, linkId, communityId);
    if (targetRole) throw conflict("Remove the user's role before banning them");
    if (await getBan(ctx, linkId, communityId)) throw conflict("User is already banned");

    const id = await ctx.db.insert("communityBans", {
      communityId,
      linkId,
      ...(reason !== undefined ? { reason } : {}),
      bannedBy: actor.linkId,
    });
    return toBanView((await ctx.db.get(id))!);
  },
});

/** DELETE /communities/:id/bans/:linkId */
export const unbanMember = mutation({
  args: { communityId: v.string(), linkId: v.string() },
  handler: async (ctx, { communityId, linkId }) => {
    const actor = await requireActor(ctx);
    await requireCommunity(ctx, communityId);
    await requireOwnerOrMod(ctx, actor, communityId);
    const ban = await getBan(ctx, linkId, communityId);
    if (!ban) throw notFound("User is not banned");
    await ctx.db.delete(ban._id);
    return null;
  },
});

// ── Pins (owner/mod) ─────────────────────────────────────────────────────────

/** PUT /communities/:id/pins/:pollId — idempotent. */
export const pinPoll = mutation({
  args: { communityId: v.string(), pollId: v.string() },
  handler: async (ctx, { communityId, pollId }) => {
    const actor = await requireActor(ctx);
    await requireCommunity(ctx, communityId);
    await requireOwnerOrMod(ctx, actor, communityId);
    const poll = await getPoll(ctx, pollId);
    if (!poll || poll.communityId !== communityId) throw notFound("Poll not found in this community");
    if (!(await getPin(ctx, communityId, pollId))) {
      await ctx.db.insert("communityPins", { communityId, pollId, pinnedBy: actor.linkId });
    }
    return { pollId };
  },
});

/** DELETE /communities/:id/pins/:pollId */
export const unpinPoll = mutation({
  args: { communityId: v.string(), pollId: v.string() },
  handler: async (ctx, { communityId, pollId }) => {
    const actor = await requireActor(ctx);
    await requireCommunity(ctx, communityId);
    await requireOwnerOrMod(ctx, actor, communityId);
    const pin = await getPin(ctx, communityId, pollId);
    if (!pin) throw notFound("Poll is not pinned");
    await ctx.db.delete(pin._id);
    return null;
  },
});
