// auth-service profile client. (Reading the current user lives in lib/session — 401-aware.)

import { api } from "./api";
import type { MeProfile, PublicProfile, UpdateProfileInput } from "./types";

export const updateMe = (input: UpdateProfileInput) => api.patch<MeProfile>("/users/me", input);

export const getPublicProfile = (userId: string) =>
  api.get<PublicProfile>(`/users/${encodeURIComponent(userId)}`);
