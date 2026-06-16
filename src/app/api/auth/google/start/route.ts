// GET /api/auth/google/start — begin Google sign-in (startGoogle.controller port).
// Creates the CSRF/PKCE transaction, stores it in a short-lived httpOnly cookie, and
// redirects the browser to Google's consent screen.

import { type NextRequest, NextResponse } from "next/server";
import { createTransaction, buildAuthUrl } from "@/lib/server/google";
import { COOKIE, signTransaction, setCookie, safeReturnTo } from "@/lib/server/session";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { tx, codeChallenge } = createTransaction();
  // Capture an optional same-site return path (open-redirect-guarded) to ride the round-trip.
  const returnTo = safeReturnTo(req.nextUrl.searchParams.get("returnTo"));
  const res = NextResponse.redirect(buildAuthUrl(tx.state, codeChallenge));
  setCookie(res, COOKIE.OAUTH_TX, await signTransaction({ ...tx, returnTo: returnTo ?? undefined }), 10 * 60);
  return res;
}
