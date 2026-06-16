// The three short-lived HS256 tokens the auth flow rides on, ported from the
// auth-service (shared/session + signupToken.logic + the oauth-tx half of
// googleOAuth.logic), plus the cookie plumbing for Next.js route handlers.
//
// Identity model (ADR-006): the session carries the random `linkId` pseudonym, NEVER
// the real-person userId. Cookie names are unchanged from the backend (constants/auth)
// so a locally running legacy gateway accepts the same session during the migration.

import { SignJWT, jwtVerify } from "jose";
import type { NextResponse } from "next/server";
import { sessionSecret, SESSION_TTL_SECONDS } from "./env";

export const COOKIE = {
  /** Our session JWT (httpOnly) — the source of truth for who the caller is. */
  SESSION: "tz_session",
  /** Short-lived OAuth transaction cookie: holds state + PKCE verifier. */
  OAUTH_TX: "tz_oauth_tx",
  /** Verified-but-not-created first-time identity awaiting the age gate (ADR-008). */
  SIGNUP_PENDING: "tz_signup",
} as const;

const ALG = "HS256";
const secret = () => new TextEncoder().encode(sessionSecret());

// ── Session token ────────────────────────────────────────────────────────────

export interface SessionClaims {
  /** linkId — the pseudonym every Convex function sees as the JWT subject. */
  lid: string;
}

export async function signSession(linkId: string): Promise<string> {
  return new SignJWT({ lid: linkId })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secret());
}

export async function verifySession(token: string | undefined | null): Promise<SessionClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: [ALG] });
    if (typeof payload.lid !== "string" || !payload.lid) return null;
    return { lid: payload.lid };
  } catch {
    return null;
  }
}

// ── OAuth transaction token (CSRF state + PKCE verifier, 10 min) ─────────────

export interface OAuthTransaction {
  state: string;
  codeVerifier: string;
  /** Where to send the browser after sign-in completes (open-redirect-guarded). */
  returnTo?: string;
}

export async function signTransaction(tx: OAuthTransaction): Promise<string> {
  return new SignJWT({ st: tx.state, cv: tx.codeVerifier, rt: tx.returnTo })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(secret());
}

export async function readTransaction(token: string | undefined): Promise<OAuthTransaction | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: [ALG] });
    if (typeof payload.st === "string" && typeof payload.cv === "string") {
      return {
        state: payload.st,
        codeVerifier: payload.cv,
        returnTo: typeof payload.rt === "string" ? payload.rt : undefined,
      };
    }
    return null;
  } catch {
    return null;
  }
}

// ── Signup-pending token (verified identity awaiting the age gate, 15 min) ───

export interface SignupPending {
  provider: "google";
  sub: string;
  email: string;
  name?: string;
  /** Carried across the age-gate so a first-timer lands back where they started. */
  returnTo?: string;
}

export async function signSignupPending(p: SignupPending): Promise<string> {
  return new SignJWT({ pv: p.provider, sub: p.sub, em: p.email, nm: p.name, rt: p.returnTo })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(secret());
}

export async function readSignupPending(token: string | undefined): Promise<SignupPending | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: [ALG] });
    if (payload.pv !== "google" || typeof payload.sub !== "string" || typeof payload.em !== "string") {
      return null;
    }
    return {
      provider: "google",
      sub: payload.sub,
      email: payload.em,
      name: typeof payload.nm === "string" ? payload.nm : undefined,
      returnTo: typeof payload.rt === "string" ? payload.rt : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Open-redirect guard: a returnTo is honored only if it's a same-site absolute path —
 * starts with a single "/", not "//" or "/\" (which browsers treat as protocol-relative
 * external URLs). Anything else (or absent) → null, and callers use their own default.
 */
export function safeReturnTo(raw: string | null | undefined): string | null {
  if (!raw || !/^\/(?![/\\])/.test(raw)) return null;
  return raw;
}

// ── Cookie plumbing ──────────────────────────────────────────────────────────

const base = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  secure: process.env.NODE_ENV === "production",
};

export function setCookie(res: NextResponse, name: string, value: string, maxAgeSeconds: number): void {
  res.cookies.set(name, value, { ...base, maxAge: maxAgeSeconds });
}

export function clearCookie(res: NextResponse, name: string): void {
  res.cookies.set(name, "", { ...base, maxAge: 0 });
}
