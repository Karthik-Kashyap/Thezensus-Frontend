// Identities access: external login (provider, subject) → userId. One-account-per-
// identity is enforced by getIdentity + insert inside a single mutation: a concurrent
// first-login reads the same index range, so OCC retries the loser and it sees the
// winner's row (DDB's conditional-put semantics, spike-proven — REVIEW-002 finding 4).

import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";

export const PROVIDER = { GOOGLE: "GOOGLE" } as const;
export type Provider = (typeof PROVIDER)[keyof typeof PROVIDER];

export async function getIdentity(
  ctx: QueryCtx | MutationCtx,
  provider: Provider,
  subject: string,
): Promise<Doc<"identities"> | null> {
  return await ctx.db
    .query("identities")
    .withIndex("by_provider_subject", (q) => q.eq("provider", provider).eq("subject", subject))
    .unique();
}

export async function insertIdentity(
  ctx: MutationCtx,
  provider: Provider,
  subject: string,
  userId: string,
): Promise<void> {
  await ctx.db.insert("identities", { provider, subject, userId });
}

/** Deletion Phase A half: remove the login row. */
export async function deleteIdentity(ctx: MutationCtx, doc: Doc<"identities">): Promise<void> {
  await ctx.db.delete(doc._id);
}
