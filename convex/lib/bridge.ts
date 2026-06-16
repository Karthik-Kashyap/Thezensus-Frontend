// Guard for the auth-bridge functions (convex/authBridge.ts): they are public functions
// (the Next.js route handlers call them over HTTP before any user JWT exists), so each
// call must present the shared secret. Set it on BOTH sides:
//   npx convex env set AUTH_BRIDGE_SECRET <value>     (Convex deployment)
//   AUTH_BRIDGE_SECRET=<value> in .env.local          (Next.js server)
// Fails closed: an unset secret rejects every call.

import { forbidden } from "./errors";

export function requireBridgeSecret(secret: string): void {
  const expected = process.env.AUTH_BRIDGE_SECRET;
  if (!expected || secret !== expected) throw forbidden("Invalid bridge secret");
}
