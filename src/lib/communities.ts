// community-service client. I/O + typing only; UI calls these, never fetch directly.

import { api } from "./api";
import type { Community, CreateCommunityInput, Subscription } from "./types";

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
