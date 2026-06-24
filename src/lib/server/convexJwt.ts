// Mints the short-lived RS256 JWT the Convex client authenticates with (DESIGN-006 §6.3).
// Claims contract (convex/auth.config.ts): iss = AUTH_JWT_ISSUER, aud = "pollzens",
// sub = linkId (ADR-006 — the pseudonym, never the userId), header kid matching the JWKS
// on the Convex deployment. Short TTL: the client re-fetches from /api/auth/convex-token
// (cookie-gated), so a stolen token ages out fast while the session cookie stays the
// single source of truth.

import { SignJWT, importPKCS8 } from "jose";
import { convexAuthPrivateKey, convexAuthKid, jwtIssuer, JWT_AUDIENCE } from "./env";

const TOKEN_TTL_SECONDS = 60 * 60; // 1 hour; convex re-fetches on expiry

let keyPromise: Promise<CryptoKey> | null = null;
const privateKey = () => (keyPromise ??= importPKCS8(convexAuthPrivateKey(), "RS256"));

export async function mintConvexJwt(linkId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "RS256", kid: convexAuthKid(), typ: "JWT" })
    .setSubject(linkId)
    .setIssuer(jwtIssuer())
    .setAudience(JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${TOKEN_TTL_SECONDS}s`)
    .sign(await privateKey());
}
