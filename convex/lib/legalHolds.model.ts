// Legal-hold data access (FOUNDATION-07): the deletion/sweep gate plus the Phase 4
// open/release surface. Holds are append-only history rows; "current" = any ACTIVE row.

import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { HOLD_STATUS, subjectKey as buildSubjectKey } from "./constants/moderation";

type Ctx = QueryCtx | MutationCtx;

/** True if ANY of the subject keys has an ACTIVE hold — blocks deletion + retention sweeps. */
export async function hasActiveHold(ctx: Ctx, subjectKeys: string[]): Promise<boolean> {
  for (const subjectKey of subjectKeys) {
    const holds = await ctx.db
      .query("legalHolds")
      .withIndex("by_subject", (q) => q.eq("subjectKey", subjectKey))
      .collect();
    if (holds.some((h) => h.status === HOLD_STATUS.ACTIVE)) return true;
  }
  return false;
}

export async function listHoldsBySubject(
  ctx: Ctx,
  subjectType: string,
  subjectId: string,
): Promise<Doc<"legalHolds">[]> {
  return await ctx.db
    .query("legalHolds")
    .withIndex("by_subject", (q) => q.eq("subjectKey", buildSubjectKey(subjectType, subjectId)))
    .order("desc")
    .collect();
}

export interface OpenHoldInput {
  subjectType: string;
  subjectId: string;
  reason: string;
  caseRef?: string;
  expiresAt?: string;
  openedBy: string;
}

export async function openHold(ctx: MutationCtx, input: OpenHoldInput): Promise<Doc<"legalHolds">> {
  const id = await ctx.db.insert("legalHolds", {
    subjectKey: buildSubjectKey(input.subjectType, input.subjectId),
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    reason: input.reason,
    ...(input.caseRef !== undefined ? { caseRef: input.caseRef } : {}),
    status: HOLD_STATUS.ACTIVE,
    openedBy: input.openedBy,
    ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt } : {}),
  });
  return (await ctx.db.get(id))!;
}

/** Release every ACTIVE hold on a subject; returns how many were released. */
export async function releaseHolds(
  ctx: MutationCtx,
  subjectType: string,
  subjectId: string,
): Promise<number> {
  const holds = await listHoldsBySubject(ctx, subjectType, subjectId);
  const active = holds.filter((h) => h.status === HOLD_STATUS.ACTIVE);
  for (const hold of active) {
    await ctx.db.patch(hold._id, {
      status: HOLD_STATUS.RELEASED,
      releasedAt: new Date().toISOString(),
    });
  }
  return active.length;
}
