// Votes client — now Convex (api.votes.*). Same DTOs as the old vote-service
// (CastVoteResult / MyVote); errors rethrown in the legacy { status } shape.

import { convex } from "./convexClient";
import { api } from "../../convex/_generated/api";
import { withApiError } from "./convexErrors";
import type { CastVoteInput, CastVoteResult, MyVote } from "./types";

/** Cast a first vote. Guests (LINK polls) may pass `guestName`. */
export const castVote = (input: CastVoteInput) =>
  withApiError(convex.mutation(api.votes.cast, input)) as unknown as Promise<CastVoteResult>;

/** Switch an existing vote to a different option (logged-in only). */
export const changeVote = (input: Omit<CastVoteInput, "guestName">) =>
  withApiError(convex.mutation(api.votes.change, input)) as unknown as Promise<CastVoteResult>;

/** Read the caller's own current vote on a poll-edition (read-your-write). */
export const getMyVote = (pollId: string, token?: string) =>
  withApiError(convex.query(api.votes.getMine, { pollId, token })) as unknown as Promise<MyVote>;
