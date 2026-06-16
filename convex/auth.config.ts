// Convex JWT validation config (DESIGN-006 §6). The Next.js token route mints short-lived
// RS256 JWTs whose subject is the caller's linkId (ADR-006 — never the userId); Convex
// validates them against OUR public keys.
//
// Both values are Convex deployment environment variables (set via `npx convex env set`):
//   AUTH_JWT_ISSUER — must EXACTLY match the JWT `iss` claim. A constant identifier, not
//                     a fetched URL (e.g. https://thezensus.com) — works the same on
//                     localhost and prod.
//   AUTH_JWKS       — the public key set as a data URI
//                     (data:text/plain;charset=utf-8;base64,<base64 of the JWKS JSON>),
//                     so Convex never needs to reach our server — which is what makes
//                     local dev work when the app runs on localhost.
// scripts/generate-auth-keys.mjs produces both values.

export default {
  providers: [
    {
      type: "customJwt",
      applicationID: "thezensus", // must match the JWT `aud` claim
      issuer: process.env.AUTH_JWT_ISSUER,
      jwks: process.env.AUTH_JWKS,
      algorithm: "RS256",
    },
  ],
};
