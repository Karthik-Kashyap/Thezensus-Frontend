// POST /api/auth/convex-token — the session-cookie → Convex-JWT exchange (DESIGN-006
// §6.3). The httpOnly cookie stays the single source of truth; this hands the browser a
// short-lived RS256 token scoped to Convex. Returns { token: null } (not 401) when signed
// out — the Convex client treats null as "unauthenticated", which is a normal state.

import { type NextRequest, NextResponse } from "next/server";
import { COOKIE, verifySession } from "@/lib/server/session";
import { mintConvexJwt } from "@/lib/server/convexJwt";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await verifySession(req.cookies.get(COOKIE.SESSION)?.value);
  if (!session) return NextResponse.json({ token: null });
  return NextResponse.json({ token: await mintConvexJwt(session.lid) });
}
