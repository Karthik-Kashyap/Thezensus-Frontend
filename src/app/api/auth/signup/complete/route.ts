// POST /api/auth/signup/complete — the age gate + account creation step
// (signupComplete.controller port, ADR-008/009). Reads the signup-pending cookie (the
// verified-but-not-created identity), hands DOB + consent to the Convex signup
// transaction, and on success mints the session cookie. A 403 means under-13 — nothing
// was created, nothing stored.

import { type NextRequest, NextResponse } from "next/server";
import { createAccount } from "@/lib/server/convex";
import { SESSION_TTL_SECONDS } from "@/lib/server/env";
import { COOKIE, readSignupPending, signSession, setCookie, clearCookie } from "@/lib/server/session";

interface Body {
  birthDate?: string;
  // Optional; demographics defaults to granted server-side when omitted. Marketing email is
  // not collected at signup yet.
  consent?: { demographics?: boolean };
}

const DOB_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const pending = await readSignupPending(req.cookies.get(COOKIE.SIGNUP_PENDING)?.value);
  if (!pending) {
    return NextResponse.json(
      { message: "Signup session expired — please sign in with Google again" },
      { status: 401 },
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.birthDate || !DOB_RE.test(body.birthDate)) {
    return NextResponse.json({ message: "birthDate (YYYY-MM-DD) is required" }, { status: 400 });
  }

  // Forward demographics consent only if the client explicitly sent it; otherwise omit so the
  // signup transaction applies its server-side default (granted).
  const consent =
    typeof body.consent?.demographics === "boolean"
      ? { demographics: body.consent.demographics }
      : undefined;

  const outcome = await createAccount({
    subject: pending.sub,
    email: pending.email,
    legalName: pending.name, // → PII vault only (legal hold); never the public identity
    birthDate: body.birthDate,
    consent,
  });

  if (outcome.status === "underage") {
    // COPPA (ADR-008): reject, create nothing, store nothing. Clear the pending token too.
    const res = NextResponse.json(
      { message: "You must be at least 13 years old to use Pollzens." },
      { status: 403 },
    );
    clearCookie(res, COOKIE.SIGNUP_PENDING);
    return res;
  }

  const res = NextResponse.json({ linkId: outcome.linkId }, { status: 201 });
  clearCookie(res, COOKIE.SIGNUP_PENDING);
  setCookie(res, COOKIE.SESSION, await signSession(outcome.linkId), SESSION_TTL_SECONDS);
  return res;
}
