// Auth actions. Sign-in is Google OAuth handled by OUR Next.js route handlers (the old
// auth-service's successors), which set the session cookie; the Convex client then
// exchanges the cookie for a live token automatically (lib/convexClient).

import { clearConvexAuth } from "./convexClient";

/** Top-level navigation target to begin Google sign-in (a real navigation, not fetch).
 *  `returnTo` (a same-site path) brings the user back where they started after sign-in;
 *  it's open-redirect-guarded server-side in the OAuth start route. */
export function googleLoginUrl(returnTo?: string): string {
  const base = "/api/auth/google/start";
  return returnTo ? `${base}?returnTo=${encodeURIComponent(returnTo)}` : base;
}

export async function logout(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST" });
  clearConvexAuth();
}
