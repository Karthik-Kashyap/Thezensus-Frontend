// 🔐 UserPII vault access (ADR-006) — the ONLY module allowed to touch the userPII
// table. Imported exclusively by the auth domain (users/consent/authBridge functions);
// nothing in the poll/vote/community/media domains may import this file. This code
// boundary is decision D3 (DESIGN-006 §9); hardening into an isolated Convex component
// is a planned fast-follow.

import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";

type Ctx = QueryCtx | MutationCtx;

export async function getPiiByUserId(ctx: Ctx, userId: string): Promise<Doc<"userPII"> | null> {
  return await ctx.db
    .query("userPII")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
}

/** The privileged reverse lookup (linkId → vault row). DDB's ByLinkId GSI. */
export async function getPiiByLinkId(ctx: Ctx, linkId: string): Promise<Doc<"userPII"> | null> {
  return await ctx.db
    .query("userPII")
    .withIndex("by_linkId", (q) => q.eq("linkId", linkId))
    .unique();
}

export interface InsertPiiInput {
  userId: string;
  linkId: string;
  email: string;
  legalName: string;
  birthDate: string; // full DOB — vault only
  googleSub: string;
}

export async function insertPii(ctx: MutationCtx, input: InsertPiiInput): Promise<void> {
  await ctx.db.insert("userPII", input);
}

/** Deletion Phase A half: remove the vault row (raw PII + the userId↔linkId link). */
export async function deletePii(ctx: MutationCtx, doc: Doc<"userPII">): Promise<void> {
  await ctx.db.delete(doc._id);
}
