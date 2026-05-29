// Auth actions. Both login paths end with the backend setting the session cookie;
// the frontend then re-probes the session (no client-side token storage).

import { api, API_BASE } from "./api";

/** Top-level navigation target to begin Google sign-in (must be a real navigation, not fetch). */
export const googleLoginUrl = `${API_BASE}/api/auth/google/start`;

/** Local dev login (offline stand-in for Google). Sets the session cookie. */
export async function devLogin(email: string, displayName?: string): Promise<void> {
  await api.post("/auth/login", { email, displayName });
}

export async function logout(): Promise<void> {
  await api.post("/auth/logout");
}
