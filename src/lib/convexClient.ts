// The browser's Convex client — module scope so React hooks (via ConvexProvider) and the
// promise-style lib functions (profile/consent) share one authenticated WebSocket.
//
// Auth: setAuth is given a fetcher that exchanges our httpOnly session cookie for a
// short-lived RS256 JWT at /api/auth/convex-token. Convex calls it on connect and again
// before expiry; a { token: null } response (signed out) leaves the client in the normal
// unauthenticated state. The cookie remains the single source of truth — the browser
// never holds a long-lived credential JS can read.

"use client";

import { ConvexReactClient } from "convex/react";

const url = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!url) {
  throw new Error(
    "NEXT_PUBLIC_CONVEX_URL is not set — run `npx convex dev` once (it writes .env.local), then restart `npm run dev`.",
  );
}

export const convex = new ConvexReactClient(url);

async function fetchConvexToken(): Promise<string | null> {
  try {
    const res = await fetch("/api/auth/convex-token", { method: "POST" });
    if (!res.ok) return null;
    const { token } = (await res.json()) as { token: string | null };
    return token;
  } catch {
    return null;
  }
}

convex.setAuth(fetchConvexToken);

/** Drop the live token immediately on logout (the cookie is cleared server-side). */
export function clearConvexAuth(): void {
  convex.clearAuth();
  convex.setAuth(fetchConvexToken); // re-arm: next fetch sees no cookie → null until next login
}
