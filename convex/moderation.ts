// Moderation API — the moderation-service surface: reports + queue, appeals,
// enforcement (suspend/reinstate), content takedowns, media preservation, legal
// holds, and the append-only audit log. Admin functions re-check the admin grant on
// every call (requireAdmin); filing reports/appeals is open to any signed-in user
// (appeals even to suspended/banned ones — that's the point).

import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { requireActor, requireActorEvenIfBanned, requireAdmin } from "./lib/actor";
import { badRequest, notFound, conflict } from "./lib/errors";
import { newReportId } from "./lib/ids";
import {
  REPORT_CATEGORY,
  REPORT_STATUS,
  REPORT_RESOLUTION,
  REPORT_TARGET,
  MOD_SCOPE,
  MOD_ACTION,
  SUBJECT_TYPE,
  ACCOUNT_STATUS,
  CONTENT_MOD_STATUS,
  MODERATION_LIMITS,
  QUEUE_PAGE,
  reportTargetKey,
  reportQueueCat,
} from "./lib/constants/moderation";
import { MEDIA_STATUS } from "./lib/constants/media";
import {
  validateReason,
  toReportView,
  toModActionView,
  toLegalHoldView,
  toUserModStatusView,
} from "./lib/moderation.logic";
import {
  getReport,
  listOpenReports,
  listReportsByTarget,
  writeModAction,
  listActionsByTarget,
  setModStatus,
  clearModStatus,
  bumpModRep,
} from "./lib/moderation.model";
import { openHold, releaseHolds, listHoldsBySubject } from "./lib/legalHolds.model";
import { getModeration } from "./lib/users.model";
import { getPoll } from "./lib/polls.model";
import { getComment } from "./lib/comments.model";
import { getMedia } from "./lib/media.model";

const reportCategoryArg = v.union(
  v.literal("CSAM"),
  v.literal("HARASSMENT"),
  v.literal("HATE"),
  v.literal("VIOLENCE_THREAT"),
  v.literal("SELF_HARM"),
  v.literal("SPAM"),
  v.literal("ILLEGAL_OTHER"),
  v.literal("USER_ESCALATION"),
  v.literal("OTHER"),
); // APPEAL deliberately absent — system-filed via fileAppeal only

const targetTypeArg = v.union(
  v.literal("POLL"),
  v.literal("COMMENT"),
  v.literal("USER"),
  v.literal("COMMUNITY"),
);

const subjectTypeArg = v.union(
  v.literal("USER"),
  v.literal("POLL"),
  v.literal("COMMENT"),
  v.literal("MEDIA"),
);

/** Insert a report with the sparse queue keys set (drops out of the queue on resolve). */
async function insertReport(
  ctx: MutationCtx,
  fields: {
    category: string;
    scope: "PLATFORM" | "COMMUNITY";
    communityId?: string;
    targetType: string;
    targetId: string;
    reporterId: string;
    reason?: string;
  },
): Promise<string> {
  const reportId = newReportId();
  await ctx.db.insert("reports", {
    reportId,
    category: fields.category,
    status: REPORT_STATUS.OPEN,
    scope: fields.scope,
    ...(fields.communityId !== undefined ? { communityId: fields.communityId } : {}),
    targetType: fields.targetType,
    targetId: fields.targetId,
    targetKey: reportTargetKey(fields.targetType, fields.targetId),
    reporterId: fields.reporterId,
    ...(fields.reason !== undefined ? { reason: fields.reason } : {}),
    queueState: REPORT_STATUS.OPEN,
    queueCat: reportQueueCat(fields.category),
  });
  return reportId;
}

// ── Reports (user-facing) ────────────────────────────────────────────────────

/** POST /moderation/reports — any signed-in user. */
export const createReport = mutation({
  args: {
    category: reportCategoryArg,
    targetType: targetTypeArg,
    targetId: v.string(),
    reason: v.optional(v.string()),
    communityId: v.optional(v.string()),
  },
  handler: async (ctx, input) => {
    const actor = await requireActor(ctx);
    if (input.targetId.length === 0) throw badRequest("Missing target");
    validateReason(input.reason);

    const reportId = await insertReport(ctx, {
      category: input.category,
      scope: input.communityId !== undefined ? MOD_SCOPE.COMMUNITY : MOD_SCOPE.PLATFORM,
      communityId: input.communityId,
      targetType: input.targetType,
      targetId: input.targetId,
      reporterId: actor.linkId,
      reason: input.reason,
    });
    await bumpModRep(ctx, actor.linkId, "reportsMade");
    return { reportId };
  },
});

/** POST /moderation/appeals — a suspended/banned user contests their enforcement.
 *  Deliberately skips the ban gate; one open appeal at a time. */
export const fileAppeal = mutation({
  args: { reason: v.optional(v.string()) },
  handler: async (ctx, { reason }) => {
    const actor = await requireActorEvenIfBanned(ctx);
    validateReason(reason);

    const existing = await listReportsByTarget(ctx, REPORT_TARGET.USER, actor.linkId);
    if (existing.some((r) => r.category === REPORT_CATEGORY.APPEAL && r.queueState !== undefined)) {
      throw conflict("You already have an open appeal");
    }

    const reportId = await insertReport(ctx, {
      category: REPORT_CATEGORY.APPEAL,
      scope: MOD_SCOPE.PLATFORM,
      targetType: REPORT_TARGET.USER,
      targetId: actor.linkId, // self-referential (D-MOD-3)
      reporterId: actor.linkId,
      reason,
    });
    return { reportId };
  },
});

// ── Admin: queue + resolution ────────────────────────────────────────────────

/** GET /moderation/reports — the open queue (sparse index; resolved rows fall out). */
export const listReports = query({
  args: {
    category: v.optional(v.string()),
    order: v.optional(v.union(v.literal("newest"), v.literal("oldest"))),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { category, order, limit }) => {
    await requireAdmin(ctx);
    const reports = await listOpenReports(ctx, {
      category,
      order: order ?? "newest",
      limit: Math.min(Math.max(limit ?? QUEUE_PAGE.defaultLimit, 1), QUEUE_PAGE.maxLimit),
    });
    return reports.map(toReportView);
  },
});

/** GET /moderation/reports/:id — one report + everything else filed on its target. */
export const getReportDetail = query({
  args: { reportId: v.string() },
  handler: async (ctx, { reportId }) => {
    await requireAdmin(ctx);
    const report = await getReport(ctx, reportId);
    if (!report) throw notFound("Report not found");
    const related = (await listReportsByTarget(ctx, report.targetType, report.targetId)).filter(
      (r) => r.reportId !== reportId,
    );
    return { report: toReportView(report), related: related.map(toReportView) };
  },
});

/** POST /moderation/reports/:id/resolve — stamps + strips the queue keys.
 *  Reporter reputation moves with the outcome (never for appeals). */
export const resolveReport = mutation({
  args: {
    reportId: v.string(),
    resolution: v.union(v.literal("ACTION_TAKEN"), v.literal("DISMISSED"), v.literal("DUPLICATE")),
    relatedActionId: v.optional(v.string()),
  },
  handler: async (ctx, { reportId, resolution, relatedActionId }) => {
    const admin = await requireAdmin(ctx);
    const report = await getReport(ctx, reportId);
    if (!report) throw notFound("Report not found");
    if (report.queueState === undefined) throw conflict("Report is already resolved");

    await ctx.db.patch(report._id, {
      status: REPORT_STATUS.RESOLVED,
      resolution,
      resolvedBy: admin.linkId,
      resolvedAt: new Date().toISOString(),
      ...(relatedActionId !== undefined ? { relatedActionId } : {}),
      queueState: undefined,
      queueCat: undefined,
    });

    if (report.category !== REPORT_CATEGORY.APPEAL) {
      if (resolution === REPORT_RESOLUTION.ACTION_TAKEN) {
        await bumpModRep(ctx, report.reporterId, "reportsUpheld");
      } else if (resolution === REPORT_RESOLUTION.DISMISSED) {
        await bumpModRep(ctx, report.reporterId, "reportsDismissed");
      }
    }
    return toReportView((await ctx.db.get(report._id))!);
  },
});

// ── Admin: account enforcement ───────────────────────────────────────────────

/** POST /moderation/users/:linkId/suspend — suspend (temporary) or ban (permanent). */
export const suspendUser = mutation({
  args: {
    linkId: v.string(),
    mode: v.union(v.literal("SUSPENDED"), v.literal("BANNED")),
    reason: v.string(),
    until: v.optional(v.string()),
    relatedReportId: v.optional(v.string()),
  },
  handler: async (ctx, { linkId, mode, reason, until, relatedReportId }) => {
    const admin = await requireAdmin(ctx);
    if (reason.length === 0 || reason.length > MODERATION_LIMITS.reasonMax) {
      throw badRequest("A reason is required");
    }
    if (mode === ACCOUNT_STATUS.SUSPENDED && !until) {
      throw badRequest("Suspensions need an `until` date");
    }
    if (linkId === admin.linkId) throw badRequest("You can't suspend yourself");

    const before = await getModeration(ctx, linkId);
    const doc = await setModStatus(ctx, linkId, {
      accountStatus: mode,
      scope: MOD_SCOPE.PLATFORM,
      reason,
      by: admin.linkId,
      until: mode === ACCOUNT_STATUS.SUSPENDED ? until : undefined,
      relatedReportId,
    });
    await writeModAction(ctx, {
      targetType: SUBJECT_TYPE.USER,
      targetId: linkId,
      action: mode === ACCOUNT_STATUS.BANNED ? MOD_ACTION.BAN : MOD_ACTION.SUSPEND,
      actorId: admin.linkId,
      reason,
      relatedReportId,
      before: { accountStatus: before?.accountStatus ?? ACCOUNT_STATUS.ACTIVE },
      after: { accountStatus: mode, until: doc.until },
    });
    return toUserModStatusView(doc);
  },
});

/** POST /moderation/users/:linkId/reinstate */
export const reinstateUser = mutation({
  args: { linkId: v.string() },
  handler: async (ctx, { linkId }) => {
    const admin = await requireAdmin(ctx);
    const before = await getModeration(ctx, linkId);
    await clearModStatus(ctx, linkId);
    await writeModAction(ctx, {
      targetType: SUBJECT_TYPE.USER,
      targetId: linkId,
      action: MOD_ACTION.UNSUSPEND,
      actorId: admin.linkId,
      before: { accountStatus: before?.accountStatus ?? ACCOUNT_STATUS.ACTIVE },
      after: { accountStatus: ACCOUNT_STATUS.ACTIVE },
    });
    return null;
  },
});

// ── Admin: content takedowns ─────────────────────────────────────────────────

/** POST /moderation/polls/:id/takedown — platform takedown (hidden from ALL reads). */
export const takedownPoll = mutation({
  args: { pollId: v.string(), reason: v.optional(v.string()), reportId: v.optional(v.string()) },
  handler: async (ctx, { pollId, reason, reportId }) => {
    const admin = await requireAdmin(ctx);
    validateReason(reason);
    const poll = await getPoll(ctx, pollId);
    if (!poll) throw notFound("Poll not found");
    if (poll.modStatus === CONTENT_MOD_STATUS.TAKEN_DOWN) throw conflict("Already taken down");

    await ctx.db.patch(poll._id, {
      modStatus: CONTENT_MOD_STATUS.TAKEN_DOWN,
      ...(reportId !== undefined ? { takedownReportId: reportId } : {}),
    });
    await writeModAction(ctx, {
      targetType: SUBJECT_TYPE.POLL,
      targetId: pollId,
      action: MOD_ACTION.TAKEDOWN,
      actorId: admin.linkId,
      reason,
      relatedReportId: reportId,
    });
    return null;
  },
});

/** POST /moderation/polls/:id/restore */
export const restorePoll = mutation({
  args: { pollId: v.string() },
  handler: async (ctx, { pollId }) => {
    const admin = await requireAdmin(ctx);
    const poll = await getPoll(ctx, pollId);
    if (!poll) throw notFound("Poll not found");
    if (poll.modStatus !== CONTENT_MOD_STATUS.TAKEN_DOWN) throw conflict("Poll is not taken down");

    await ctx.db.patch(poll._id, { modStatus: CONTENT_MOD_STATUS.OK, takedownReportId: undefined });
    await writeModAction(ctx, {
      targetType: SUBJECT_TYPE.POLL,
      targetId: pollId,
      action: MOD_ACTION.RESTORE,
      actorId: admin.linkId,
    });
    return null;
  },
});

/** POST /moderation/comments/:id/takedown — hidden from everyone, including thread mods. */
export const takedownComment = mutation({
  args: { commentId: v.string(), reason: v.optional(v.string()), reportId: v.optional(v.string()) },
  handler: async (ctx, { commentId, reason, reportId }) => {
    const admin = await requireAdmin(ctx);
    validateReason(reason);
    const comment = await getComment(ctx, commentId);
    if (!comment) throw notFound("Comment not found");
    if (comment.modStatus === CONTENT_MOD_STATUS.TAKEN_DOWN) throw conflict("Already taken down");

    await ctx.db.patch(comment._id, { modStatus: CONTENT_MOD_STATUS.TAKEN_DOWN });
    await writeModAction(ctx, {
      targetType: SUBJECT_TYPE.COMMENT,
      targetId: commentId,
      action: MOD_ACTION.TAKEDOWN,
      actorId: admin.linkId,
      reason,
      relatedReportId: reportId,
    });
    return null;
  },
});

// ── Admin: media preservation + legal holds ──────────────────────────────────

/** POST /moderation/media/:id/preserve — evidence lock: off serving, deletion-proof. */
export const preserveMedia = mutation({
  args: {
    mediaId: v.string(),
    ownerId: v.string(),
    reason: v.optional(v.string()),
    reportId: v.optional(v.string()),
  },
  handler: async (ctx, { mediaId, ownerId, reason, reportId }) => {
    const admin = await requireAdmin(ctx);
    validateReason(reason);
    const media = await getMedia(ctx, ownerId, mediaId);
    if (!media) throw notFound("Media not found");
    if (media.status === MEDIA_STATUS.PRESERVED) throw conflict("Already preserved");

    await ctx.db.patch(media._id, {
      status: MEDIA_STATUS.PRESERVED,
      pendingExpiresAt: undefined, // the TTL-strip: preserved evidence never sweeps
      ...(reportId !== undefined ? { preservedReportId: reportId } : {}),
    });
    await writeModAction(ctx, {
      targetType: SUBJECT_TYPE.MEDIA,
      targetId: mediaId,
      action: MOD_ACTION.PRESERVE,
      actorId: admin.linkId,
      reason,
      relatedReportId: reportId,
      before: { status: media.status },
      after: { status: MEDIA_STATUS.PRESERVED },
    });
    return null;
  },
});

/** POST /moderation/holds — open a preservation hold on a subject. */
export const openLegalHold = mutation({
  args: {
    subjectType: subjectTypeArg,
    subjectId: v.string(),
    reason: v.union(
      v.literal("LE_REQUEST"),
      v.literal("CSAM_PRESERVE"),
      v.literal("INVESTIGATION"),
      v.literal("LITIGATION"),
    ),
    caseRef: v.optional(v.string()),
    expiresAt: v.optional(v.string()),
    relatedReportId: v.optional(v.string()),
  },
  handler: async (ctx, input) => {
    const admin = await requireAdmin(ctx);
    if (input.caseRef !== undefined && input.caseRef.length > MODERATION_LIMITS.caseRefMax) {
      throw badRequest("Case reference too long");
    }
    const hold = await openHold(ctx, {
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      reason: input.reason,
      caseRef: input.caseRef,
      expiresAt: input.expiresAt,
      openedBy: admin.linkId,
    });
    await writeModAction(ctx, {
      targetType: input.subjectType,
      targetId: input.subjectId,
      action: MOD_ACTION.HOLD_OPEN,
      actorId: admin.linkId,
      relatedReportId: input.relatedReportId,
      after: { reason: input.reason, caseRef: input.caseRef },
    });
    return toLegalHoldView(hold);
  },
});

/** POST /moderation/holds/release — release ALL active holds on a subject. */
export const releaseLegalHold = mutation({
  args: { subjectType: subjectTypeArg, subjectId: v.string() },
  handler: async (ctx, { subjectType, subjectId }) => {
    const admin = await requireAdmin(ctx);
    const released = await releaseHolds(ctx, subjectType, subjectId);
    if (released > 0) {
      await writeModAction(ctx, {
        targetType: subjectType,
        targetId: subjectId,
        action: MOD_ACTION.HOLD_RELEASE,
        actorId: admin.linkId,
        after: { released },
      });
    }
    return { released };
  },
});

/** Holds on one subject (admin console). */
export const listLegalHolds = query({
  args: { subjectType: subjectTypeArg, subjectId: v.string() },
  handler: async (ctx, { subjectType, subjectId }) => {
    await requireAdmin(ctx);
    return (await listHoldsBySubject(ctx, subjectType, subjectId)).map(toLegalHoldView);
  },
});

/** GET /moderation/actions — the per-target audit trail. */
export const listActions = query({
  args: { targetType: subjectTypeArg, targetId: v.string() },
  handler: async (ctx, { targetType, targetId }) => {
    await requireAdmin(ctx);
    return (await listActionsByTarget(ctx, targetType, targetId)).map(toModActionView);
  },
});
