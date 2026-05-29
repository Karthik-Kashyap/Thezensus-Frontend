// comment-service client.

import { api } from "./api";
import type { Comment, Page } from "./types";

export const postComment = (pollId: string, text: string, token?: string) =>
  api.post<Comment>("/comments", { pollId, text, token });

export const editComment = (commentId: string, pollId: string, text: string) =>
  api.patch<Comment>(`/comments/${encodeURIComponent(commentId)}`, { pollId, text });

export const deleteComment = (commentId: string, pollId: string) =>
  api.del<void>(`/comments/${encodeURIComponent(commentId)}?pollId=${encodeURIComponent(pollId)}`);

/** A poll's comment thread (newest-first, cursor-paginated). */
export const listPollComments = (
  pollId: string,
  opts?: { token?: string; limit?: number; cursor?: string },
) => {
  const q = new URLSearchParams({ pollId });
  if (opts?.token) q.set("token", opts.token);
  if (opts?.limit) q.set("limit", String(opts.limit));
  if (opts?.cursor) q.set("cursor", opts.cursor);
  return api.get<Page<Comment>>(`/comments?${q.toString()}`);
};
