// Comments-domain behavior: posting/viewing gates (stricter than poll VIEW access —
// protected/private community polls take members-only comments) and DTO mapping.
// DTO shape mirrors src/lib/types.ts Comment.

import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { POLL_AUDIENCE, POLL_VISIBILITY } from "./constants/poll";
import { COMMENT_LIMITS } from "./constants/community";
import { badRequest, notFound, forbidden } from "./errors";
import { isMember, isOwnerOrMod, isBannedFromCommunity } from "./communities.model";

type Ctx = QueryCtx | MutationCtx;

export function validateCommentText(text: string): string {
  const t = text.trim();
  if (t.length < COMMENT_LIMITS.textMin || t.length > COMMENT_LIMITS.textMax) {
    throw badRequest(`Comments must be ${COMMENT_LIMITS.textMin}–${COMMENT_LIMITS.textMax} characters`);
  }
  return t;
}

/**
 * May this signed-in user POST a comment on this poll?
 *  - LINK: exact shareToken (creator exempt)
 *  - COMMUNITY public: any signed-in, not banned
 *  - COMMUNITY protected/private: member OR creator OR owner/mod, not banned
 */
export async function assertCanComment(
  ctx: Ctx,
  poll: Doc<"polls">,
  linkId: string,
  token?: string,
): Promise<void> {
  if (poll.audienceType === POLL_AUDIENCE.LINK) {
    if (poll.creatorId === linkId) return;
    if (token !== poll.shareToken) throw notFound("Poll not found");
    return;
  }
  const communityId = poll.communityId;
  if (!communityId) return; // defensive
  if (await isBannedFromCommunity(ctx, linkId, communityId)) {
    throw forbidden("You are banned from this community");
  }
  const visibility = poll.visibility ?? POLL_VISIBILITY.PUBLIC;
  if (visibility === POLL_VISIBILITY.PUBLIC) return;
  if (poll.creatorId === linkId) return;
  if (await isMember(ctx, linkId, communityId)) return;
  if (await isOwnerOrMod(ctx, linkId, communityId)) return;
  throw forbidden("Membership required to comment on this poll");
}

/** May this viewer moderate the thread (see REMOVED rows, remove others' comments)? */
export async function canModerateThread(
  ctx: Ctx,
  poll: Doc<"polls">,
  linkId: string | null,
): Promise<boolean> {
  if (!linkId) return false;
  if (poll.creatorId === linkId) return true;
  if (poll.audienceType === POLL_AUDIENCE.COMMUNITY && poll.communityId) {
    return await isOwnerOrMod(ctx, linkId, poll.communityId);
  }
  return false;
}

export function toCommentView(comment: Doc<"comments">): Record<string, unknown> {
  return {
    pollId: comment.pollId,
    commentId: comment.commentId,
    authorId: comment.authorId ?? "[deleted]",
    text: comment.text,
    status: comment.status,
    createdAt: new Date(comment._creationTime).toISOString(),
    ...(comment.editedAt !== undefined ? { updatedAt: comment.editedAt } : {}),
  };
}
