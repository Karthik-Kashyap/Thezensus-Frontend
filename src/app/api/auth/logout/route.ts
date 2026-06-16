// POST /api/auth/logout — clear the session cookie (logout.controller port). The Convex
// JWT is not revoked — it simply ages out (≤1h) and can't be re-minted without the cookie;
// the client also drops its token immediately (lib/auth.ts calls convex.clearAuth()).

import { NextResponse } from "next/server";
import { COOKIE, clearCookie } from "@/lib/server/session";

export async function POST(): Promise<NextResponse> {
  const res = new NextResponse(null, { status: 204 });
  clearCookie(res, COOKIE.SESSION);
  return res;
}
