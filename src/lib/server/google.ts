// Google OAuth 2.0 (Authorization Code + PKCE) + OIDC ID-token verification — a direct
// port of the auth-service's googleOAuth.logic (ADR-004: direct Google OAuth, no Cognito).
// Pure logic: builds the auth URL, exchanges the code server-side, verifies the returned
// ID token against Google's JWKS. Cookie concerns live in the route handlers.

import { createHash, randomBytes } from "node:crypto";
import { jwtVerify, createRemoteJWKSet } from "jose";
import { googleClientId, googleClientSecret, googleRedirectUri } from "./env";
import type { OAuthTransaction } from "./session";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

const b64url = (buf: Buffer) => buf.toString("base64url");

export interface GoogleIdentity {
  sub: string;
  email: string;
  name?: string;
}

/** Fresh CSRF state + PKCE verifier/challenge for one login attempt. */
export function createTransaction(): { tx: OAuthTransaction; codeChallenge: string } {
  const state = b64url(randomBytes(16));
  const codeVerifier = b64url(randomBytes(32));
  const codeChallenge = b64url(createHash("sha256").update(codeVerifier).digest());
  return { tx: { state, codeVerifier }, codeChallenge };
}

/** The Google consent URL to redirect the browser to. */
export function buildAuthUrl(state: string, codeChallenge: string): string {
  const params = new URLSearchParams({
    client_id: googleClientId(),
    redirect_uri: googleRedirectUri(),
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    access_type: "online",
    prompt: "select_account",
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

/** Exchange the authorization code for tokens (server-side, with the client secret). */
export async function exchangeCodeForIdToken(code: string, codeVerifier: string): Promise<string> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: googleClientId(),
      client_secret: googleClientSecret(),
      redirect_uri: googleRedirectUri(),
      grant_type: "authorization_code",
      code_verifier: codeVerifier,
    }),
  });
  if (!res.ok) {
    throw new Error(`Google token exchange failed (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as { id_token?: string };
  if (!data.id_token) throw new Error("Google token response missing id_token");
  return data.id_token;
}

const googleJwks = createRemoteJWKSet(new URL(GOOGLE_JWKS_URL));

/** Verify a Google ID token (signature via JWKS, issuer, audience) → identity claims. */
export async function verifyGoogleIdToken(idToken: string): Promise<GoogleIdentity> {
  const { payload } = await jwtVerify(idToken, googleJwks, {
    issuer: GOOGLE_ISSUERS,
    audience: googleClientId(),
  });
  const sub = payload.sub;
  const email = typeof payload.email === "string" ? payload.email : undefined;
  if (!sub || !email) throw new Error("Google ID token missing sub/email");
  return { sub, email, name: typeof payload.name === "string" ? payload.name : undefined };
}
