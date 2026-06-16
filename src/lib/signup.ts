// Signup client (ADR-008/009). The first-time Google identity is handed a signed
// signup-pending cookie by the OAuth callback; this completes the account with a DOB +
// consent against our route handler (which runs the Convex signup transaction). The
// server enforces the 13+ age gate (a 403 means under-13 — nothing was stored).

import type { CompleteSignupInput } from "./types";

/** POST /api/auth/signup/complete → { linkId } (201). Sets the session cookie on success. */
export async function completeSignup(input: CompleteSignupInput): Promise<{ linkId: string }> {
  const res = await fetch("/api/auth/signup/complete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    let detail: unknown;
    try {
      detail = await res.json();
    } catch {
      detail = await res.text();
    }
    const err = new Error(`API ${res.status}: /auth/signup/complete`) as Error & {
      status?: number;
      detail?: unknown;
    };
    err.status = res.status;
    err.detail = detail;
    throw err;
  }
  // The session cookie was just set without a page navigation, so the live Convex
  // client must re-run its token exchange to become authenticated (an OAuth login
  // doesn't need this — the redirect reloads the app).
  const { clearConvexAuth } = await import("./convexClient");
  clearConvexAuth();
  return (await res.json()) as { linkId: string };
}
