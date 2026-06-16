// Consent API — the auth-service /users/me/consent surface (ADR-009). Thin controllers;
// behavior in lib/consent.logic. DTO shapes mirror src/lib/types.ts (ConsentView).

import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireActor } from "./lib/actor";
import { getConsentView, applyConsentUpdate } from "./lib/consent.logic";

/** GET /users/me/consent — latest state per purpose + the policy version. */
export const get = query({
  args: {},
  handler: async (ctx) => {
    const actor = await requireActor(ctx);
    return await getConsentView(ctx, actor.linkId);
  },
});

/** PUT /users/me/consent — toggle purposes (append-only events; syncs the vote-path flag). */
export const update = mutation({
  args: {
    demographics: v.optional(v.boolean()),
    marketingEmail: v.optional(v.boolean()),
  },
  handler: async (ctx, input) => {
    const actor = await requireActor(ctx);
    return await applyConsentUpdate(ctx, actor.linkId, input);
  },
});
