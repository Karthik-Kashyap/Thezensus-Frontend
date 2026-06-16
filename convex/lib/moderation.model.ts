// Moderation-domain data access: reports (with the sparse-queue pattern), the
// append-only modActions audit log, and enforcement writes on userModeration.
// Legal holds live in legalHolds.model.ts.

import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { newUlid } from "./ids";
import { ACCOUNT_STATUS, REPORT_STATUS, reportTargetKey } from "./constants/moderation";
import { getModeration } from "./users.model";

type Ctx = QueryCtx | MutationCtx;

// ── Reports ──────────────────────────────────────────────────────────────────

export async function getReport(ctx: Ctx, reportId: string): Promise<Doc<"reports"> | null> {
  return await ctx.db
    .query("reports")
    .withIndex("by_reportId", (q) => q.eq("reportId", reportId))
    .unique();
}

/** Open queue, newest/oldest-first. queueState is sparse — resolved rows fall out. */
export async function listOpenReports(
  ctx: Ctx,
  opts: { category?: string; order: "newest" | "oldest"; limit: number },
): Promise<Doc<"reports">[]> {
  const direction = opts.order === "oldest" ? "asc" : "desc";
  if (opts.category !== undefined) {
    const queueCat = `OPEN#${opts.category}`;
    return await ctx.db
      .query("reports")
      .withIndex("by_queue_cat", (q) => q.eq("queueCat", queueCat))
      .order(direction)
      .take(opts.limit);
  }
  return await ctx.db
    .query("reports")
    .withIndex("by_queue", (q) => q.eq("queueState", REPORT_STATUS.OPEN))
    .order(direction)
    .take(opts.limit);
}

/** Every report ever filed on one target ("reported N times" + open-appeal dedupe). */
export async function listReportsByTarget(
  ctx: Ctx,
  targetType: string,
  targetId: string,
): Promise<Doc<"reports">[]> {
  return await ctx.db
    .query("reports")
    .withIndex("by_target", (q) => q.eq("targetKey", reportTargetKey(targetType, targetId)))
    .order("desc")
    .collect();
}

// ── ModActions (append-only audit) ───────────────────────────────────────────

export interface ModActionInput {
  targetType: string;
  targetId: string;
  action: string;
  actorId: string;
  reason?: string;
  relatedReportId?: string;
  before?: unknown;
  after?: unknown;
}

export async function writeModAction(ctx: MutationCtx, input: ModActionInput): Promise<string> {
  const actionId = newUlid();
  await ctx.db.insert("modActions", {
    targetKey: reportTargetKey(input.targetType, input.targetId),
    actionId,
    targetType: input.targetType,
    targetId: input.targetId,
    action: input.action,
    actorId: input.actorId,
    ...(input.reason !== undefined ? { reason: input.reason } : {}),
    ...(input.relatedReportId !== undefined ? { relatedReportId: input.relatedReportId } : {}),
    ...(input.before !== undefined ? { before: input.before } : {}),
    ...(input.after !== undefined ? { after: input.after } : {}),
  });
  return actionId;
}

export async function listActionsByTarget(
  ctx: Ctx,
  targetType: string,
  targetId: string,
): Promise<Doc<"modActions">[]> {
  return await ctx.db
    .query("modActions")
    .withIndex("by_target", (q) => q.eq("targetKey", reportTargetKey(targetType, targetId)))
    .order("desc")
    .collect();
}

// ── Enforcement writes (userModeration: MOD_STATUS + MOD_REP merged) ────────

const EMPTY_REP = { reportsMade: 0, reportsUpheld: 0, reportsDismissed: 0, strikes: 0 };

async function getOrCreateModeration(ctx: MutationCtx, linkId: string): Promise<Doc<"userModeration">> {
  const existing = await getModeration(ctx, linkId);
  if (existing) return existing;
  const id = await ctx.db.insert("userModeration", { linkId, accountStatus: ACCOUNT_STATUS.ACTIVE });
  return (await ctx.db.get(id))!;
}

export interface ModStatusInput {
  accountStatus: "SUSPENDED" | "BANNED";
  scope: "PLATFORM" | "COMMUNITY";
  reason: string;
  by: string;
  until?: string;
  relatedReportId?: string;
}

export async function setModStatus(
  ctx: MutationCtx,
  linkId: string,
  input: ModStatusInput,
): Promise<Doc<"userModeration">> {
  const doc = await getOrCreateModeration(ctx, linkId);
  await ctx.db.patch(doc._id, {
    accountStatus: input.accountStatus,
    scope: input.scope,
    reason: input.reason,
    by: input.by,
    at: new Date().toISOString(),
    until: input.until, // undefined clears (BANNED has no expiry)
    relatedReportId: input.relatedReportId,
  });
  return (await ctx.db.get(doc._id))!;
}

/** Reinstate: back to ACTIVE; enforcement fields cleared, rep/admin grants kept. */
export async function clearModStatus(ctx: MutationCtx, linkId: string): Promise<void> {
  const doc = await getModeration(ctx, linkId);
  if (!doc) return;
  await ctx.db.patch(doc._id, {
    accountStatus: ACCOUNT_STATUS.ACTIVE,
    scope: undefined,
    reason: undefined,
    by: undefined,
    at: undefined,
    until: undefined,
    relatedReportId: undefined,
  });
}

export async function bumpModRep(
  ctx: MutationCtx,
  linkId: string,
  field: "reportsMade" | "reportsUpheld" | "reportsDismissed" | "strikes",
): Promise<void> {
  const doc = await getOrCreateModeration(ctx, linkId);
  const rep = { ...EMPTY_REP, ...(doc.modRep ?? {}) };
  rep[field] += 1;
  await ctx.db.patch(doc._id, { modRep: rep });
}
