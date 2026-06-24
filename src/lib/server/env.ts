// Server-only environment access for the auth route handlers. Everything here is read
// lazily with a loud error, so a missing var fails the specific flow that needs it with
// a clear message instead of a generic 500. See .env.example for the full list;
// scripts/generate-auth-keys.mjs generates the secrets.

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name} (see .env.example)`);
  return value;
}

/** App origin — cookie/redirect home. */
export const appUrl = () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

/** HS256 secret for our session / oauth-tx / signup-pending cookies (same role as the old backend's). */
export const sessionSecret = () => required("SESSION_SECRET");

/** Session cookie lifetime. */
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

export const googleClientId = () => required("GOOGLE_CLIENT_ID");
export const googleClientSecret = () => required("GOOGLE_CLIENT_SECRET");
export const googleRedirectUri = () => `${appUrl()}/api/auth/google/callback`;

export const convexUrl = () => required("NEXT_PUBLIC_CONVEX_URL");

/** Shared secret for the authBridge functions (also set on the Convex deployment). */
export const bridgeSecret = () => required("AUTH_BRIDGE_SECRET");

/** RS256 private key (PKCS8 PEM) for minting Convex JWTs. `\n`-escaped in .env.local. */
export const convexAuthPrivateKey = () => required("CONVEX_AUTH_PRIVATE_KEY").replace(/\\n/g, "\n");

/** Key id — must match the `kid` in the JWKS uploaded to the Convex deployment. */
export const convexAuthKid = () => required("CONVEX_AUTH_KID");

/** JWT issuer — a constant identifier that must EXACTLY match the Convex deployment's
 *  AUTH_JWT_ISSUER env var. Not fetched by anyone (the JWKS travels as a data URI). */
export const jwtIssuer = () => process.env.AUTH_JWT_ISSUER ?? "https://pollzens.com";

/** JWT audience — must match `applicationID` in convex/auth.config.ts. */
export const JWT_AUDIENCE = "pollzens";
