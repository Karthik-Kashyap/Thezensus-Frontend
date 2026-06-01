// Auth actions. Sign-in is Google OAuth handled by the backend, which sets the session cookie;
// the frontend then re-probes the session (no client-side token storage).

import { api, API_BASE } from "./api";

/** Top-level navigation target to begin Google sign-in (must be a real navigation, not fetch). */
export const googleLoginUrl = `${API_BASE}/api/auth/google/start`;

export async function logout(): Promise<void> {
  await api.post("/auth/logout");
}
