// vote-service client.

import { api } from "./api";
import type { CastVoteInput, CastVoteResult, MyVote } from "./types";

/** Cast a first vote. Guests (LINK polls) may pass `guestName`. */
export const castVote = (input: CastVoteInput) => api.post<CastVoteResult>("/votes", input);

/** Switch an existing vote to a different option (logged-in only). */
export const changeVote = (input: Omit<CastVoteInput, "guestName">) =>
  api.post<CastVoteResult>("/votes/change", input);

/** Read the caller's own current vote on a poll-edition (read-your-write). */
export const getMyVote = (pollId: string, token?: string) => {
  const q = new URLSearchParams({ pollId });
  if (token) q.set("token", token);
  return api.get<MyVote>(`/votes?${q.toString()}`);
};
