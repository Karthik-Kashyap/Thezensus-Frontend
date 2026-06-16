// Comments-domain data access. Threads page newest-first off by_poll; the author view
// pages by_author. Soft deletes only (status REMOVED) — rows are the audit trail.

import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";

type Ctx = QueryCtx | MutationCtx;

export async function getComment(ctx: Ctx, commentId: string): Promise<Doc<"comments"> | null> {
  return await ctx.db
    .query("comments")
    .withIndex("by_commentId", (q) => q.eq("commentId", commentId))
    .unique();
}

/** Newest-first thread pages (callers filter REMOVED/TAKEN_DOWN per viewer). */
export function commentsByPoll(ctx: Ctx, pollId: string) {
  return ctx.db
    .query("comments")
    .withIndex("by_poll", (q) => q.eq("pollId", pollId))
    .order("desc");
}

export function commentsByAuthor(ctx: Ctx, authorId: string) {
  return ctx.db
    .query("comments")
    .withIndex("by_author", (q) => q.eq("authorId", authorId))
    .order("desc");
}
