// One-time key/secret generation for the Convex auth bridge (DESIGN-006 §6).
// Run:  node scripts/generate-auth-keys.mjs
// Prints (1) the lines to paste into .env.local and (2) the `npx convex env set`
// commands to run for the Convex deployment. Nothing is written to disk — re-running
// generates a fresh, unrelated set (rotating keys logs everyone's Convex token out for
// at most an hour; sessions survive as long as SESSION_SECRET is unchanged).

import { generateKeyPairSync, createPublicKey, randomBytes } from "node:crypto";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const pkcs8 = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const jwk = createPublicKey(privateKey).export({ format: "jwk" });

const kid = randomBytes(8).toString("hex");
const jwks = JSON.stringify({ keys: [{ ...jwk, use: "sig", alg: "RS256", kid }] });
const jwksDataUri = `data:text/plain;charset=utf-8;base64,${Buffer.from(jwks).toString("base64")}`;

const sessionSecret = randomBytes(32).toString("base64url");
const bridgeSecret = randomBytes(32).toString("base64url");
const issuer = "https://thezensus.com";

console.log("─".repeat(72));
console.log("1) Append to frontend/.env.local  (KEEP PRIVATE — never commit)");
console.log("─".repeat(72));
console.log(`SESSION_SECRET=${sessionSecret}`);
console.log(`AUTH_BRIDGE_SECRET=${bridgeSecret}`);
console.log(`AUTH_JWT_ISSUER=${issuer}`);
console.log(`CONVEX_AUTH_KID=${kid}`);
console.log(`CONVEX_AUTH_PRIVATE_KEY="${pkcs8.trim().replace(/\n/g, "\\n")}"`);
console.log();
console.log("─".repeat(72));
console.log("2) Run for the Convex deployment (after `npx convex dev` has run once)");
console.log("─".repeat(72));
console.log(`npx convex env set AUTH_BRIDGE_SECRET ${bridgeSecret}`);
console.log(`npx convex env set AUTH_JWT_ISSUER ${issuer}`);
console.log(`npx convex env set AUTH_JWKS "${jwksDataUri}"`);
console.log();
console.log("Also needed in .env.local: GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET (from the");
console.log("Google Cloud OAuth client; add http://localhost:3000/api/auth/google/callback");
console.log("as an authorized redirect URI) — see .env.example.");
