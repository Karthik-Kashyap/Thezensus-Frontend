// poll-service client.

import { api } from "./api";
import type { CreatePollInput, Page, Poll, PollListItem } from "./types";

export const createPoll = (input: CreatePollInput) => api.post<Poll>("/polls", input);

export const getPoll = (id: string, token?: string) =>
  api.get<Poll>(`/polls/${encodeURIComponent(id)}${token ? `?token=${encodeURIComponent(token)}` : ""}`);

export const updatePoll = (
  id: string,
  input: Partial<{ question: string; visibility: string; requireLoginToVote: boolean; status: "ACTIVE" | "CLOSED"; tags: string[]; category: string }>,
) => api.patch<Poll>(`/polls/${encodeURIComponent(id)}`, input);

export const deletePoll = (id: string) => api.del<void>(`/polls/${encodeURIComponent(id)}`);

/** Community feed (newest-first, cursor-paginated). */
export const listCommunityPolls = (communityId: string, opts?: { limit?: number; cursor?: string }) =>
  listPolls({ communityId, ...opts });

/** A creator's polls (drives profile poll lists). */
export const listCreatorPolls = (creatorId: string, opts?: { limit?: number; cursor?: string }) =>
  listPolls({ creatorId, ...opts });

function listPolls(params: { communityId?: string; creatorId?: string; limit?: number; cursor?: string }) {
  const q = new URLSearchParams();
  if (params.communityId) q.set("communityId", params.communityId);
  if (params.creatorId) q.set("creatorId", params.creatorId);
  if (params.limit) q.set("limit", String(params.limit));
  if (params.cursor) q.set("cursor", params.cursor);
  return api.get<Page<PollListItem>>(`/polls?${q.toString()}`);
}
