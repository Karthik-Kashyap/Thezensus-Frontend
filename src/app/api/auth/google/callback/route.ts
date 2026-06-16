// GET /api/auth/google/callback — finish Google sign-in (googleCallback.controller port).
// Verifies state against the transaction cookie, exchanges the code (PKCE), verifies the
// ID token, then resolves the identity via Convex:
//   returning → mint session cookie, redirect home
//   first-time → mint signup-pending cookie (NO account yet — age gate first, ADR-008),
//                redirect to /signup

import { type NextRequest, NextResponse } from "next/server";
import { exchangeCodeForIdToken, verifyGoogleIdToken } from "@/lib/server/google";
import { resolveLogin } from "@/lib/server/convex";
import { appUrl, SESSION_TTL_SECONDS } from "@/lib/server/env";
import {
  COOKIE,
  readTransaction,
  signSession,
  signSignupPending,
  setCookie,
  clearCookie,
} from "@/lib/server/session";

const redirectWithError = (reason: string) => {
  const res = NextResponse.redirect(`${appUrl()}/?authError=${encodeURIComponent(reason)}`);
  clearCookie(res, COOKIE.OAUTH_TX);
  return res;
};

export async function GET(req: NextRequest): Promise<NextResponse> {
  const params = req.nextUrl.searchParams;
  if (params.get("error")) return redirectWithError("google_denied");

  const code = params.get("code");
  const state = params.get("state");
  if (!code || !state) return redirectWithError("missing_code");

  // Split the old catch-all "invalid_state" so the cause is visible in the server log. The
  // tx cookie is set by /start on whatever host the browser is on; it fails to come back when
  // it expired (10 min), was cleared by a parallel attempt, or — most often in dev — the start
  // host and the callback host differ (e.g. starting on 127.0.0.1 / a LAN IP / the tunnel URL
  // while redirect_uri is pinned to http://localhost:3000, so Google returns to localhost).
  const txCookie = req.cookies.get(COOKIE.OAUTH_TX)?.value;
  const tx = await readTransaction(txCookie);
  if (!tx) {
    console.warn(
      `[auth] callback rejected: ${txCookie ? "unreadable/expired" : "missing"} ${COOKIE.OAUTH_TX} cookie. ` +
        "Likely an expired transaction or a host mismatch (start host ≠ callback host). " +
        "Browse via the exact origin registered with Google (http://localhost:3000).",
    );
    return redirectWithError("expired");
  }
  if (state !== tx.state) {
    console.warn("[auth] callback rejected: state mismatch (a second sign-in likely overwrote the first).");
    return redirectWithError("state_mismatch");
  }

  let identity;
  try {
    const idToken = await exchangeCodeForIdToken(code, tx.codeVerifier);
    identity = await verifyGoogleIdToken(idToken);
  } catch {
    return redirectWithError("token_exchange_failed");
  }

  const resolution = await resolveLogin(identity.sub);

  if (resolution.status === "returning") {
    // Back where they started (tx.returnTo is already open-redirect-guarded), else home.
    const res = NextResponse.redirect(`${appUrl()}${tx.returnTo ?? "/"}`);
    clearCookie(res, COOKIE.OAUTH_TX);
    setCookie(res, COOKIE.SESSION, await signSession(resolution.linkId), SESSION_TTL_SECONDS);
    return res;
  }

  // First-time identity: verified by Google, but no account until the age gate passes.
  // Carry returnTo through the pending cookie so signup lands them back at the start point.
  const res = NextResponse.redirect(`${appUrl()}/signup`);
  clearCookie(res, COOKIE.OAUTH_TX);
  setCookie(
    res,
    COOKIE.SIGNUP_PENDING,
    await signSignupPending({
      provider: "google",
      sub: identity.sub,
      email: identity.email,
      name: identity.name,
      returnTo: tx.returnTo,
    }),
    15 * 60,
  );
  return res;
}
