// Polls API — the poll-service surface (create/get/list/discover/update/delete).
// Thin controllers: arg validation + actor resolution here; behavior in
// lib/polls.logic; data access in lib/polls.model. DTOs mirror src/lib/types.ts.

import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { optionalActor, requireActor } from "./lib/actor";
import { badRequest, notFound, forbidden } from "./lib/errors";
import { newPollId, newShareToken } from "./lib/ids";
import {
  POLL_AUDIENCE,
  POLL_VISIBILITY,
  POLL_STATUS,
  DEFAULT_AUDIENCE,
  DEFAULT_VISIBILITY,
  DEFAULT_BALLOT_MODE,
  DEFAULT_RECURRENCE,
  FEED_PAGE,
} from "./lib/constants/poll";
import { isTimeBased } from "./lib/editions.logic";
import {
  validateQuestion,
  validateOptions,
  validateTagsCategory,
  validateTimezone,
  resolvePollMedia,
  canViewPoll,
  canEditPoll,
  isHidden,
  editionView,
  toPollDetail,
  toFeedItem,
  homeFeedItems,
  discoverFeedItems,
  publiclyListable,
  initialEditionLabel,
} from "./lib/polls.logic";
import { getPoll, pollsByCommunity, pollsByCreator } from "./lib/polls.model";
import {
  getCommunity,
  isMember,
  isOwnerOrMod,
  isBannedFromCommunity,
  listSubscriptionsByUser,
} from "./lib/communities.model";

const pollOption = v.object({
  id: v.string(),
  label: v.string(),
  mediaId: v.optional(v.string()),
});

/** POST /polls — create. Caller becomes creator. */
export const create = mutation({
  args: {
    question: v.string(),
    questionMediaId: v.optional(v.string()),
    type: v.union(v.literal("binary"), v.literal("multi")),
    options: v.array(pollOption),
    audienceType: v.optional(v.union(v.literal("COMMUNITY"), v.literal("LINK"))),
    communityId: v.optional(v.string()),
    visibility: v.optional(
      v.union(v.literal("public"), v.literal("protected"), v.literal("private")),
    ),
    ballotMode: v.optional(v.union(v.literal("standard"), v.literal("anonymous"))),
    requireLoginToVote: v.optional(v.boolean()),
    recurrence: v.optional(
      v.union(
        v.literal("NONE"),
        v.literal("DAILY"),
        v.literal("WEEKLY"),
        v.literal("MONTHLY"),
        v.literal("YEARLY"),
        v.literal("MANUAL"),
      ),
    ),
    timezone: v.optional(v.string()),
    recurrenceStart: v.optional(v.string()),
    recurrenceEnd: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    category: v.optional(v.string()),
    shareCardShowResults: v.optional(v.boolean()),
  },
  handler: async (ctx, input) => {
    const actor = await requireActor(ctx);

    const question = validateQuestion(input.question);
    validateOptions(input.type, input.options);
    validateTagsCategory(input.tags, input.category);
    const recurrence = input.recurrence ?? DEFAULT_RECURRENCE;
    if (input.timezone !== undefined) validateTimezone(input.timezone);
    if (isTimeBased(recurrence) && input.timezone === undefined) {
      throw badRequest("Time-based recurrence requires a timezone");
    }

    // Validate + denormalize any attached images (owned by the creator, right kind, READY).
    const media = await resolvePollMedia(ctx, actor.linkId, input.questionMediaId, input.options);

    const audienceType = input.audienceType ?? DEFAULT_AUDIENCE;
    const base = {
      pollId: newPollId(),
      creatorId: actor.linkId,
      audienceType,
      question,
      ...(media.questionMediaId !== undefined
        ? { questionMediaId: media.questionMediaId, questionMediaKey: media.questionMediaKey }
        : {}),
      type: input.type,
      options: media.options,
      ballotMode: input.ballotMode ?? DEFAULT_BALLOT_MODE,
      requireLoginToVote: input.requireLoginToVote ?? false,
      recurrence,
      timezone: input.timezone,
      recurrenceStart: input.recurrenceStart,
      recurrenceEnd: input.recurrenceEnd,
      status: POLL_STATUS.ACTIVE,
      tags: input.tags,
      category: input.category,
      shareCardShowResults: input.shareCardShowResults,
      currentEdition: initialEditionLabel(recurrence, input.timezone),
    };

    if (audienceType === POLL_AUDIENCE.COMMUNITY) {
      if (!input.communityId) throw badRequest("communityId is required for community polls");
      const community = await getCommunity(ctx, input.communityId);
      if (!community) throw notFound("Community not found");
      if (await isBannedFromCommunity(ctx, actor.linkId, input.communityId)) {
        throw forbidden("You are banned from this community");
      }
      const member = await isMember(ctx, actor.linkId, input.communityId);
      if (community.visibility === POLL_VISIBILITY.PRIVATE && !member) {
        if (!(await isOwnerOrMod(ctx, actor.linkId, input.communityId))) {
          throw forbidden("Membership required to post in this community");
        }
      }
      await ctx.db.insert("polls", {
        ...base,
        communityId: input.communityId,
        visibility: input.visibility ?? DEFAULT_VISIBILITY,
      });
    } else {
      // LINK poll — unlisted, token-gated, never in any feed.
      await ctx.db.insert("polls", { ...base, shareToken: newShareToken() });
    }

    const poll = (await getPoll(ctx, base.pollId))!;
    return await toPollDetail(ctx, poll, await editionView(ctx, poll), actor.linkId);
  },
});

/** GET /polls/:id — detail (anonymous-allowed; token gates LINK polls).
 *  Returns null (not an error) when missing/inaccessible — the detail page subscribes
 *  live via useQuery, and null renders the not-found state without an error boundary. */
export const get = query({
  args: { pollId: v.string(), token: v.optional(v.string()) },
  handler: async (ctx, { pollId, token }) => {
    const actor = await optionalActor(ctx);
    const poll = await getPoll(ctx, pollId);
    if (!poll || !(await canViewPoll(ctx, poll, actor?.linkId ?? null, token))) {
      return null;
    }
    return await toPollDetail(ctx, poll, await editionView(ctx, poll), actor?.linkId ?? null);
  },
});

/** GET /polls?communityId= | creatorId= — community/creator feeds (anonymous-allowed). */
export const list = query({
  args: {
    communityId: v.optional(v.string()),
    creatorId: v.optional(v.string()),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, { communityId, creatorId, limit, cursor }) => {
    if ((communityId === undefined) === (creatorId === undefined)) {
      throw badRequest("Provide exactly one of communityId or creatorId");
    }
    const actor = await optionalActor(ctx);
    const viewer = actor?.linkId ?? null;
    const numItems = Math.min(Math.max(limit ?? FEED_PAGE.defaultLimit, 1), FEED_PAGE.maxLimit);

    const source = communityId !== undefined
      ? pollsByCommunity(ctx, communityId)
      : pollsByCreator(ctx, creatorId!);
    const page = await source.paginate({ numItems, cursor: cursor ?? null });

    const visible = [];
    for (const poll of page.page) {
      if (isHidden(poll)) continue;
      if (creatorId !== undefined && viewer !== creatorId) {
        // Someone else's profile: only publicly-listable community polls.
        if (!publiclyListable(poll)) continue;
      } else if (communityId !== undefined) {
        if (poll.audienceType !== POLL_AUDIENCE.COMMUNITY) continue;
        if (!(await canViewPoll(ctx, poll, viewer))) continue; // gates PRIVATE on membership
      }
      visible.push(await toFeedItem(ctx, poll));
    }
    return { items: visible, ...(page.isDone ? {} : { nextCursor: page.continueCursor }) };
  },
});

/** GET /polls/home — the signed-in user's community feed, hot-ranked across ALL their
 *  subscribed communities. Candidate generation is server-side (see homeFeedItems) so an
 *  older-but-busy poll isn't lost to a per-community recency cap. */
export const homeFeed = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const actor = await requireActor(ctx);
    const numItems = Math.min(Math.max(limit ?? FEED_PAGE.defaultLimit, 1), FEED_PAGE.maxLimit);
    const subs = await listSubscriptionsByUser(ctx, actor.linkId);
    const items = await homeFeedItems(ctx, subs.map((s) => s.communityId), actor.linkId, numItems);
    return { items };
  },
});

/** GET /polls/discover — global hot-ranked feed (anonymous-allowed). Surfaces the
 *  liveliest, most-voted polls so cold-start users see active communities + a poll to vote
 *  on right away; ranking lives in discoverFeedItems (shared with the home feed). Returns the
 *  hot trending-tag chips alongside the cards; `tag` narrows the cards to one topic. */
export const discover = query({
  args: { limit: v.optional(v.number()), tag: v.optional(v.string()) },
  handler: async (ctx, { limit, tag }) => {
    const actor = await optionalActor(ctx);
    const numItems = Math.min(Math.max(limit ?? FEED_PAGE.defaultLimit, 1), FEED_PAGE.maxLimit);
    return await discoverFeedItems(ctx, actor?.linkId ?? null, numItems, tag);
  },
});

/** PATCH /polls/:id — partial update (creator or community owner/mod).
 *  audienceType/communityId/options/recurrence/timezone are immutable. */
export const update = mutation({
  args: {
    pollId: v.string(),
    question: v.optional(v.string()),
    visibility: v.optional(
      v.union(v.literal("public"), v.literal("protected"), v.literal("private")),
    ),
    requireLoginToVote: v.optional(v.boolean()),
    status: v.optional(v.union(v.literal("ACTIVE"), v.literal("CLOSED"))),
    tags: v.optional(v.array(v.string())),
    category: v.optional(v.string()),
    shareCardShowResults: v.optional(v.boolean()),
  },
  handler: async (ctx, input) => {
    const actor = await requireActor(ctx);
    const poll = await getPoll(ctx, input.pollId);
    if (!poll || isHidden(poll)) throw notFound("Poll not found");
    if (!(await canEditPoll(ctx, poll, actor.linkId))) throw forbidden("Not allowed to edit this poll");

    const patch: Record<string, unknown> = {};
    if (input.question !== undefined) patch.question = validateQuestion(input.question);
    if (input.visibility !== undefined) {
      if (poll.audienceType !== POLL_AUDIENCE.COMMUNITY) {
        throw badRequest("Visibility applies to community polls only");
      }
      patch.visibility = input.visibility;
    }
    if (input.requireLoginToVote !== undefined) patch.requireLoginToVote = input.requireLoginToVote;
    if (input.status !== undefined) patch.status = input.status;
    validateTagsCategory(input.tags, input.category);
    if (input.tags !== undefined) patch.tags = input.tags;
    if (input.category !== undefined) patch.category = input.category;
    if (input.shareCardShowResults !== undefined) patch.shareCardShowResults = input.shareCardShowResults;
    if (Object.keys(patch).length === 0) throw badRequest("Nothing to update");

    await ctx.db.patch(poll._id, patch);
    const fresh = (await getPoll(ctx, poll.pollId))!;
    return await toPollDetail(ctx, fresh, await editionView(ctx, fresh), actor.linkId);
  },
});

/** DELETE /polls/:id — soft delete; vote history retained. */
export const remove = mutation({
  args: { pollId: v.string() },
  handler: async (ctx, { pollId }) => {
    const actor = await requireActor(ctx);
    const poll = await getPoll(ctx, pollId);
    if (!poll || isHidden(poll)) throw notFound("Poll not found");
    if (!(await canEditPoll(ctx, poll, actor.linkId))) throw forbidden("Not allowed to delete this poll");
    await ctx.db.patch(poll._id, { status: POLL_STATUS.DELETED });
    return null;
  },
});
