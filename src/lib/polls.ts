// Polls client — now Convex (api.polls.*). Promise-style wrappers keep the existing
// React Query call sites working unchanged; the poll DETAIL page subscribes live via
// useQuery(api.polls.get) instead (PollDetailView) — getPoll here is the request/
// response fallback. Errors are rethrown in the legacy { status } shape (convexErrors).

import { convex } from "./convexClient";
import { api } from "../../convex/_generated/api";
import { withApiError, type ApiError } from "./convexErrors";
import type { CreatePollInput, DiscoverFeedResult, Page, Poll, PollListItem } from "./types";

export const createPoll = (input: CreatePollInput) =>
  withApiError(convex.mutation(api.polls.create, input)) as unknown as Promise<Poll>;

export const getPoll = async (id: string, token?: string): Promise<Poll> => {
  const poll = await withApiError(convex.query(api.polls.get, { pollId: id, token }));
  if (poll === null) {
    const err = new Error("Poll not found") as ApiError;
    err.status = 404;
    throw err;
  }
  return poll as unknown as Poll;
};

export const updatePoll = (
  id: string,
  input: Partial<{ question: string; visibility: string; requireLoginToVote: boolean; status: "ACTIVE" | "CLOSED"; tags: string[]; category: string }>,
) =>
  withApiError(
    convex.mutation(api.polls.update, {
      pollId: id,
      ...input,
      visibility: input.visibility as "public" | "protected" | "private" | undefined,
    }),
  ) as unknown as Promise<Poll>;

export const deletePoll = (id: string) =>
  withApiError(convex.mutation(api.polls.remove, { pollId: id })) as unknown as Promise<void>;

/** Community feed (newest-first, cursor-paginated). */
export const listCommunityPolls = (communityId: string, opts?: { limit?: number; cursor?: string }) =>
  withApiError(
    convex.query(api.polls.list, { communityId, limit: opts?.limit, cursor: opts?.cursor }),
  ) as unknown as Promise<Page<PollListItem>>;

/**
 * Global discovery feed — hot-ranked public polls from across the platform, independent of
 * what you've joined (the cold-start surface: liveliest, most-voted polls first). Ranking is
 * server-side. Returns the trending-tag chips alongside the cards; `tag` narrows to one topic.
 */
export const listDiscoverPolls = (opts?: { limit?: number; tag?: string }) =>
  withApiError(
    convex.query(api.polls.discover, { limit: opts?.limit, tag: opts?.tag }),
  ) as unknown as Promise<DiscoverFeedResult>;

/**
 * The signed-in user's home feed: polls from communities they've joined, hot-ranked
 * server-side across all of them (candidate-generated, so no per-community recency cap).
 */
export const listHomeFeed = (opts?: { limit?: number }) =>
  withApiError(
    convex.query(api.polls.homeFeed, { limit: opts?.limit }),
  ) as unknown as Promise<Page<PollListItem>>;

/** A creator's polls (drives profile poll lists). */
export const listCreatorPolls = (creatorId: string, opts?: { limit?: number; cursor?: string }) =>
  withApiError(
    convex.query(api.polls.list, { creatorId, limit: opts?.limit, cursor: opts?.cursor }),
  ) as unknown as Promise<Page<PollListItem>>;
