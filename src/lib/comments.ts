// Comments client — now Convex (api.comments.*). Same DTOs and page envelope as the
// old comment-service; errors rethrown in the legacy { status } shape.

import { convex } from "./convexClient";
import { api } from "../../convex/_generated/api";
import { withApiError } from "./convexErrors";
import type { Comment, Page } from "./types";

export const postComment = (pollId: string, text: string, token?: string) =>
  withApiError(convex.mutation(api.comments.create, { pollId, text, token })) as unknown as Promise<Comment>;

export const editComment = (commentId: string, _pollId: string, text: string) =>
  withApiError(convex.mutation(api.comments.edit, { commentId, text })) as unknown as Promise<Comment>;

export const deleteComment = (commentId: string, _pollId: string) =>
  withApiError(convex.mutation(api.comments.remove, { commentId })) as unknown as Promise<void>;

/** A poll's comment thread (newest-first, cursor-paginated). */
export const listPollComments = (
  pollId: string,
  opts?: { token?: string; limit?: number; cursor?: string },
) =>
  withApiError(
    convex.query(api.comments.listByPoll, {
      pollId,
      token: opts?.token,
      limit: opts?.limit,
      cursor: opts?.cursor,
    }),
  ) as unknown as Promise<Page<Comment>>;
