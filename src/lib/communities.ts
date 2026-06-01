// community-service client. I/O + typing only; UI calls these, never fetch directly.

import { api } from "./api";
import type { BanView, Community, CreateCommunityInput, RoleView, Subscription } from "./types";

const enc = encodeURIComponent;

export const createCommunity = (input: CreateCommunityInput) =>
  api.post<Community>("/communities", input);

export const getCommunity = (id: string) =>
  api.get<Community>(`/communities/${encodeURIComponent(id)}`);

export const updateCommunity = (id: string, input: Partial<CreateCommunityInput>) =>
  api.patch<Community>(`/communities/${encodeURIComponent(id)}`, input);

// Membership
export const subscribe = (id: string, segments?: Record<string, string>) =>
  api.post<Subscription>(`/communities/${encodeURIComponent(id)}/subscription`, { segments });

export const unsubscribe = (id: string) =>
  api.del<void>(`/communities/${encodeURIComponent(id)}/subscription`);

export const getMySubscription = (id: string) =>
  api.get<Subscription>(`/communities/${encodeURIComponent(id)}/subscription`);

/** All communities the caller is subscribed to (drives the sidebar + home feed). */
export const listMySubscriptions = async (): Promise<Subscription[]> => {
  const res = await api.get<{ subscriptions: Subscription[] }>("/subscriptions");
  return res.subscriptions ?? [];
};

// ── Moderation (owner/mod only — the service re-checks the role on every call) ───────────────
// Roles: owner grants/removes MODERATOR. Bans: owner+mod. Pins: owner+mod. All target by linkId.

/** Roles (OWNER + moderators) in a community. Owner/mod only (403 otherwise). */
export const listCommunityRoles = async (id: string): Promise<RoleView[]> => {
  const res = await api.get<{ roles: RoleView[] }>(`/communities/${enc(id)}/roles`);
  return res.roles ?? [];
};

/** Owner-only: grant MODERATOR to a member (by linkId). */
export const addModerator = (id: string, linkId: string) =>
  api.put<RoleView>(`/communities/${enc(id)}/roles/${enc(linkId)}`, {});

/** Owner-only: remove a moderator (by linkId). */
export const removeModerator = (id: string, linkId: string) =>
  api.del<void>(`/communities/${enc(id)}/roles/${enc(linkId)}`);

/** Banned members of a community. Owner/mod only (403 otherwise). */
export const listCommunityBans = async (id: string): Promise<BanView[]> => {
  const res = await api.get<{ bans: BanView[] }>(`/communities/${enc(id)}/bans`);
  return res.bans ?? [];
};

/** Owner/mod: ban a member (by linkId) with an optional reason. */
export const banMember = (id: string, linkId: string, reason?: string) =>
  api.put<BanView>(`/communities/${enc(id)}/bans/${enc(linkId)}`, reason ? { reason } : {});

/** Owner/mod: lift a ban (by linkId). */
export const unbanMember = (id: string, linkId: string) =>
  api.del<void>(`/communities/${enc(id)}/bans/${enc(linkId)}`);

/** Owner/mod: pin a poll to the community. */
export const pinPoll = (id: string, pollId: string) =>
  api.put<{ pollId: string }>(`/communities/${enc(id)}/pins/${enc(pollId)}`, {});

/** Owner/mod: unpin a poll. */
export const unpinPoll = (id: string, pollId: string) =>
  api.del<void>(`/communities/${enc(id)}/pins/${enc(pollId)}`);
