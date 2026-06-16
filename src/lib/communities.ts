// Communities client — now Convex (api.communities.*). I/O + typing only; UI calls
// these, never the Convex client directly. Errors rethrown in the legacy { status }
// shape (convexErrors) so 403/404/409 handling survives unchanged.

import { convex } from "./convexClient";
import { api } from "../../convex/_generated/api";
import { withApiError } from "./convexErrors";
import type {
  BanView,
  Community,
  CommunitySummary,
  CreateCommunityInput,
  RoleView,
  Subscription,
} from "./types";

export const createCommunity = (input: CreateCommunityInput) =>
  withApiError(convex.mutation(api.communities.create, input)) as unknown as Promise<Community>;

export const getCommunity = (id: string) =>
  withApiError(convex.query(api.communities.get, { communityId: id })) as unknown as Promise<Community>;

export const updateCommunity = (id: string, input: Partial<CreateCommunityInput>) =>
  withApiError(
    convex.mutation(api.communities.update, { communityId: id, ...input }),
  ) as unknown as Promise<Community>;

// Membership
export const subscribe = (id: string, segments?: Record<string, string>) =>
  withApiError(
    convex.mutation(api.communities.subscribe, { communityId: id, segments }),
  ) as unknown as Promise<Subscription>;

export const unsubscribe = (id: string) =>
  withApiError(
    convex.mutation(api.communities.unsubscribe, { communityId: id }),
  ) as unknown as Promise<void>;

export const getMySubscription = (id: string) =>
  withApiError(
    convex.query(api.communities.getMySubscription, { communityId: id }),
  ) as unknown as Promise<Subscription | null>;

/** All communities the caller is subscribed to (drives the sidebar + home feed). */
export const listMySubscriptions = (): Promise<Subscription[]> =>
  withApiError(convex.query(api.communities.listMySubscriptions, {})) as unknown as Promise<
    Subscription[]
  >;

/** Popular public communities the caller hasn't joined (drives the sidebar discover list). */
export const listDiscoverableCommunities = (limit?: number): Promise<CommunitySummary[]> =>
  withApiError(
    convex.query(api.communities.listDiscoverable, { limit }),
  ) as unknown as Promise<CommunitySummary[]>;

// ── Moderation (owner/mod only — the service re-checks the role on every call) ───────────────
// Roles: owner grants/removes MODERATOR. Bans: owner+mod. Pins: owner+mod. All target by linkId.

/** Roles (OWNER + moderators) in a community. Owner/mod only (403 otherwise). */
export const listCommunityRoles = (id: string): Promise<RoleView[]> =>
  withApiError(
    convex.query(api.communities.listCommunityRoles, { communityId: id }),
  ) as unknown as Promise<RoleView[]>;

/** Owner-only: grant MODERATOR to a member (by linkId). */
export const addModerator = (id: string, linkId: string) =>
  withApiError(
    convex.mutation(api.communities.addModerator, { communityId: id, linkId }),
  ) as unknown as Promise<RoleView>;

/** Owner-only: remove a moderator (by linkId). */
export const removeModerator = (id: string, linkId: string) =>
  withApiError(
    convex.mutation(api.communities.removeModerator, { communityId: id, linkId }),
  ) as unknown as Promise<void>;

/** Banned members of a community. Owner/mod only (403 otherwise). */
export const listCommunityBans = (id: string): Promise<BanView[]> =>
  withApiError(
    convex.query(api.communities.listCommunityBans, { communityId: id }),
  ) as unknown as Promise<BanView[]>;

/** Owner/mod: ban a member (by linkId) with an optional reason. */
export const banMember = (id: string, linkId: string, reason?: string) =>
  withApiError(
    convex.mutation(api.communities.banMember, { communityId: id, linkId, reason }),
  ) as unknown as Promise<BanView>;

/** Owner/mod: lift a ban (by linkId). */
export const unbanMember = (id: string, linkId: string) =>
  withApiError(
    convex.mutation(api.communities.unbanMember, { communityId: id, linkId }),
  ) as unknown as Promise<void>;

/** Owner/mod: pin a poll to the community. */
export const pinPoll = (id: string, pollId: string) =>
  withApiError(
    convex.mutation(api.communities.pinPoll, { communityId: id, pollId }),
  ) as unknown as Promise<{ pollId: string }>;

/** Owner/mod: unpin a poll. */
export const unpinPoll = (id: string, pollId: string) =>
  withApiError(
    convex.mutation(api.communities.unpinPoll, { communityId: id, pollId }),
  ) as unknown as Promise<void>;
