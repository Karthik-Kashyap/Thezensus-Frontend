// Consent ledger access (ADR-009). Append-only: every grant/withdrawal is a new row;
// the current state for a purpose is its latest event (index order — Convex returns
// equal-prefix index ranges in _creationTime order, so .order("desc").first() is the
// DDB "newest-first begins_with" read).

import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import type { ConsentPurpose, ConsentSource } from "./constants/consent";

export interface AppendConsentInput {
  userId: string;
  purpose: ConsentPurpose;
  granted: boolean;
  policyVersion: string;
  source: ConsentSource;
}

export async function appendConsent(ctx: MutationCtx, input: AppendConsentInput): Promise<void> {
  await ctx.db.insert("consents", input);
}

/** Latest event for one purpose, or null if never recorded. */
export async function getLatestConsent(
  ctx: QueryCtx | MutationCtx,
  userId: string,
  purpose: ConsentPurpose,
): Promise<Doc<"consents"> | null> {
  return await ctx.db
    .query("consents")
    .withIndex("by_user_purpose", (q) => q.eq("userId", userId).eq("purpose", purpose))
    .order("desc")
    .first();
}

/** Latest event per purpose across the whole ledger (the consent-state read). */
export async function getLatestConsentMap(
  ctx: QueryCtx | MutationCtx,
  userId: string,
): Promise<Map<ConsentPurpose, Doc<"consents">>> {
  const events = await ctx.db
    .query("consents")
    .withIndex("by_user_purpose", (q) => q.eq("userId", userId))
    .collect();
  const latest = new Map<ConsentPurpose, Doc<"consents">>();
  for (const event of events) {
    const current = latest.get(event.purpose);
    if (!current || event._creationTime > current._creationTime) latest.set(event.purpose, event);
  }
  return latest;
}
