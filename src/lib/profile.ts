// auth-service profile client. (Reading the current user lives in lib/session — 401-aware.)

import { api } from "./api";
import type { DeletionResult, MeProfile, PublicProfile, UpdateProfileInput } from "./types";

export const updateMe = (input: UpdateProfileInput) => api.patch<MeProfile>("/users/me", input);

/** Public profile addressed by linkId (the value in /profile/[userId] is a linkId — ADR-006). */
export const getPublicProfile = (linkId: string) =>
  api.get<PublicProfile>(`/users/${encodeURIComponent(linkId)}`);

/** DELETE /users/me — irreversible account erasure (FOUNDATION-02). 409 if a legal hold is active. */
export const deleteMe = () => api.del<DeletionResult>("/users/me");
