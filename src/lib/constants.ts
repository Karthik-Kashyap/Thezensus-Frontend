// UI-facing constants, labels, and route builders. No magic strings scattered in components.

import type { Recurrence, Visibility } from "./types";

/** Must mirror auth-service constants/profile.ts GENDER_OPTIONS. */
export const GENDER_OPTIONS = [
  "female",
  "male",
  "nonbinary",
  "other",
  "prefer_not_to_say",
] as const;

/** Must mirror auth-service notif channels. */
export const NOTIF_CHANNELS = ["email", "push"] as const;

export const VISIBILITY_OPTIONS: { value: Visibility; label: string; hint: string }[] = [
  { value: "public", label: "Public", hint: "Anyone can find, view, and vote." },
  { value: "protected", label: "Protected", hint: "Anyone can view; only members vote." },
  { value: "private", label: "Private", hint: "Members only — for orgs & cohorts." },
];

export const RECURRENCE_OPTIONS: { value: Recurrence; label: string }[] = [
  { value: "NONE", label: "One-time" },
  { value: "DAILY", label: "Daily" },
  { value: "WEEKLY", label: "Weekly" },
  { value: "MONTHLY", label: "Monthly" },
  { value: "YEARLY", label: "Yearly" },
];

export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

/** Centralized route builders so links never hardcode path shapes. */
export const routes = {
  home: "/",
  me: "/me",
  profile: (userId: string) => `/profile/${encodeURIComponent(userId)}`,
  community: (id: string) => `/c/${encodeURIComponent(id)}`,
  newCommunity: "/c/new",
  poll: (id: string, token?: string) =>
    token ? `/poll/${encodeURIComponent(id)}?token=${encodeURIComponent(token)}` : `/poll/${encodeURIComponent(id)}`,
  newPoll: (communityId?: string) =>
    communityId ? `/poll/new?community=${encodeURIComponent(communityId)}` : "/poll/new",
} as const;
