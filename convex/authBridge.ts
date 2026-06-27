// Server-to-server bridge for the Next.js auth route handlers — the only Convex
// functions reachable without a user JWT (guarded by the shared bridge secret instead).
// They exist because login/signup happen BEFORE a session exists: the OAuth callback
// resolves an identity, and signup creates the account, then the route handler mints
// the session cookie + Convex JWT.

import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireBridgeSecret } from "./lib/bridge";
import { getIdentity, PROVIDER } from "./lib/identities.model";
import { getPiiByUserId } from "./lib/pii.model";
import { completeSignup } from "./lib/signup.logic";

/**
 * Identity resolution at login (auth.logic port). A returning identity resolves to its
 * linkId (the session principal); a first-time identity creates NOTHING here — it goes
 * through the age gate + consent step first (ADR-008).
 */
export const resolveLogin = query({
  args: { secret: v.string(), subject: v.string() },
  handler: async (ctx, { secret, subject }) => {
    requireBridgeSecret(secret);
    const identity = await getIdentity(ctx, PROVIDER.GOOGLE, subject);
    if (!identity) return { status: "new" as const };
    const pii = await getPiiByUserId(ctx, identity.userId);
    // A claimed identity always has a vault row (same transaction); a missing one is a
    // data-integrity bug, not a normal "new user" — fail loudly, never silently re-create.
    if (!pii) throw new Error(`Identity ${subject} resolved to userId with no vault row`);
    return { status: "returning" as const, linkId: pii.linkId };
  },
});

/** The signup transaction (age gate inside — the business rule lives with the data). */
export const createAccount = mutation({
  args: {
    secret: v.string(),
    subject: v.string(),
    email: v.string(),
    legalName: v.optional(v.string()), // PII-vault only; never the public identity
    birthDate: v.string(), // YYYY-MM-DD; 13+ enforced in logic (ADR-008)
    // Optional: demographics defaults to granted server-side when omitted. Marketing email
    // isn't collected at signup yet (added with the email system).
    consent: v.optional(v.object({ demographics: v.optional(v.boolean()) })),
  },
  handler: async (ctx, { secret, ...input }) => {
    requireBridgeSecret(secret);
    return await completeSignup(ctx, input);
  },
});
