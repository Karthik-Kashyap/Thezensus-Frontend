// Comments API — the comment-service surface (post / list / edit / remove). Thin
// controllers; gates in lib/comments.logic; data access in lib/comments.model.
// DTOs mirror src/lib/types.ts Comment + the {items, nextCursor} page envelope.

import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { optionalActor, requireActor } from "./lib/actor";
import { notFound, forbidden, conflict } from "./lib/errors";
import { newCommentId } from "./lib/ids";
import { COMMENT_STATUS, COMMENT_PAGE } from "./lib/constants/community";
import { POLL_MOD_STATUS } from "./lib/constants/poll";
import { isHidden, canViewPoll } from "./lib/polls.logic";
import { getPoll } from "./lib/polls.model";
import {
  validateCommentText,
  assertCanComment,
  canModerateThread,
  toCommentView,
} from "./lib/comments.logic";
import { getComment, commentsByPoll, commentsByAuthor } from "./lib/comments.model";
import { getProfile } from "./lib/users.model";

/** POST /comments — signed-in only; poll visibility/ban/token gates apply. */
export const create = mutation({
  args: { pollId: v.string(), text: v.string(), token: v.optional(v.string()) },
  handler: async (ctx, { pollId, text, token }) => {
    const actor = await requireActor(ctx);
    const cleanText = validateCommentText(text);

    const poll = await getPoll(ctx, pollId);
    if (!poll || isHidden(poll)) throw notFound("Poll not found");
    await assertCanComment(ctx, poll, actor.linkId, token);

    // Denormalize the author's (immutable) handle onto the row so the byline needs no read.
    const authorHandle = (await getProfile(ctx, actor.linkId))?.handle;
    const id = await ctx.db.insert("comments", {
      commentId: newCommentId(),
      pollId,
      authorId: actor.linkId,
      ...(authorHandle ? { authorHandle } : {}),
      text: cleanText,
      status: COMMENT_STATUS.ACTIVE,
    });
    return toCommentView((await ctx.db.get(id))!);
  },
});

/** GET /comments?pollId= — a poll's thread, newest-first. REMOVED rows visible only to
 *  the poll creator / community owner-mods; TAKEN_DOWN rows visible to no one. */
export const listByPoll = query({
  args: {
    pollId: v.string(),
    token: v.optional(v.string()),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, { pollId, token, limit, cursor }) => {
    const actor = await optionalActor(ctx);
    const viewer = actor?.linkId ?? null;

    const poll = await getPoll(ctx, pollId);
    if (!poll || !(await canViewPoll(ctx, poll, viewer, token))) throw notFound("Poll not found");

    const numItems = Math.min(Math.max(limit ?? COMMENT_PAGE.defaultLimit, 1), COMMENT_PAGE.maxLimit);
    const page = await commentsByPoll(ctx, pollId).paginate({ numItems, cursor: cursor ?? null });

    const moderator = await canModerateThread(ctx, poll, viewer);
    const items = page.page
      .filter((c) => c.modStatus !== POLL_MOD_STATUS.TAKEN_DOWN)
      .filter((c) => c.status !== COMMENT_STATUS.REMOVED || moderator)
      .map(toCommentView);

    return { items, ...(page.isDone ? {} : { nextCursor: page.continueCursor }) };
  },
});

/** GET /comments?authorId= — the caller's own comments (author-only). */
export const listMine = query({
  args: { limit: v.optional(v.number()), cursor: v.optional(v.string()) },
  handler: async (ctx, { limit, cursor }) => {
    const actor = await requireActor(ctx);
    const numItems = Math.min(Math.max(limit ?? COMMENT_PAGE.defaultLimit, 1), COMMENT_PAGE.maxLimit);
    const page = await commentsByAuthor(ctx, actor.linkId).paginate({ numItems, cursor: cursor ?? null });
    const items = page.page
      .filter((c) => c.modStatus !== POLL_MOD_STATUS.TAKEN_DOWN)
      .map(toCommentView);
    return { items, ...(page.isDone ? {} : { nextCursor: page.continueCursor }) };
  },
});

/** PATCH /comments/:id — author edits an ACTIVE comment; stamps updatedAt. */
export const edit = mutation({
  args: { commentId: v.string(), text: v.string() },
  handler: async (ctx, { commentId, text }) => {
    const actor = await requireActor(ctx);
    const cleanText = validateCommentText(text);

    const comment = await getComment(ctx, commentId);
    if (!comment || comment.modStatus === POLL_MOD_STATUS.TAKEN_DOWN) throw notFound("Comment not found");
    if (comment.authorId !== actor.linkId) throw forbidden("Only the author can edit a comment");
    if (comment.status === COMMENT_STATUS.REMOVED) throw conflict("This comment was removed");

    await ctx.db.patch(comment._id, { text: cleanText, editedAt: new Date().toISOString() });
    return toCommentView((await ctx.db.get(comment._id))!);
  },
});

/** DELETE /comments/:id — soft delete by author, poll creator, or community owner/mod. */
export const remove = mutation({
  args: { commentId: v.string() },
  handler: async (ctx, { commentId }) => {
    const actor = await requireActor(ctx);

    const comment = await getComment(ctx, commentId);
    if (!comment || comment.modStatus === POLL_MOD_STATUS.TAKEN_DOWN) throw notFound("Comment not found");
    if (comment.status === COMMENT_STATUS.REMOVED) throw conflict("Already removed");

    if (comment.authorId !== actor.linkId) {
      const poll = await getPoll(ctx, comment.pollId);
      if (!poll || !(await canModerateThread(ctx, poll, actor.linkId))) {
        throw forbidden("Not allowed to remove this comment");
      }
    }

    await ctx.db.patch(comment._id, {
      status: COMMENT_STATUS.REMOVED,
      removedBy: actor.linkId,
      removedAt: new Date().toISOString(),
    });
    return null;
  },
});
