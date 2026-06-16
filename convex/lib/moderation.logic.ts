// Moderation-domain behavior: DTO mapping (shapes mirror src/lib/types.ts Report /
// ModAction / LegalHold / UserModStatus) and shared validation. Enforcement/queue
// data access lives in moderation.model.ts; holds in legalHolds.model.ts.

import type { Doc } from "../_generated/dataModel";
import { MODERATION_LIMITS } from "./constants/moderation";
import { badRequest } from "./errors";

export function validateReason(reason: string | undefined, label = "Reason"): void {
  if (reason !== undefined && reason.length > MODERATION_LIMITS.reasonMax) {
    throw badRequest(`${label} too long`);
  }
}

export function toReportView(report: Doc<"reports">): Record<string, unknown> {
  return {
    reportId: report.reportId,
    category: report.category,
    status: report.status,
    ...(report.resolution !== undefined ? { resolution: report.resolution } : {}),
    scope: report.scope,
    ...(report.communityId !== undefined ? { communityId: report.communityId } : {}),
    targetType: report.targetType,
    targetId: report.targetId,
    targetKey: report.targetKey,
    reporterId: report.reporterId,
    ...(report.reason !== undefined ? { reason: report.reason } : {}),
    createdAt: new Date(report._creationTime).toISOString(),
    ...(report.resolvedAt !== undefined ? { resolvedAt: report.resolvedAt } : {}),
    ...(report.resolvedBy !== undefined ? { resolvedBy: report.resolvedBy } : {}),
    ...(report.relatedActionId !== undefined ? { relatedActionId: report.relatedActionId } : {}),
    ...(report.queueState !== undefined ? { queueState: report.queueState } : {}),
    ...(report.queueCat !== undefined ? { queueCat: report.queueCat } : {}),
  };
}

export function toModActionView(action: Doc<"modActions">): Record<string, unknown> {
  return {
    targetKey: action.targetKey,
    actionId: action.actionId,
    targetType: action.targetType,
    targetId: action.targetId,
    action: action.action,
    actorId: action.actorId,
    ...(action.reason !== undefined ? { reason: action.reason } : {}),
    at: new Date(action._creationTime).toISOString(),
    ...(action.relatedReportId !== undefined ? { relatedReportId: action.relatedReportId } : {}),
    ...(action.before !== undefined ? { before: action.before } : {}),
    ...(action.after !== undefined ? { after: action.after } : {}),
  };
}

export function toLegalHoldView(hold: Doc<"legalHolds">): Record<string, unknown> {
  return {
    subjectKey: hold.subjectKey,
    subjectType: hold.subjectType,
    subjectId: hold.subjectId,
    reason: hold.reason,
    ...(hold.caseRef !== undefined ? { caseRef: hold.caseRef } : {}),
    status: hold.status,
    openedBy: hold.openedBy,
    openedAt: new Date(hold._creationTime).toISOString(),
    ...(hold.releasedAt !== undefined ? { releasedAt: hold.releasedAt } : {}),
    ...(hold.expiresAt !== undefined ? { expiresAt: hold.expiresAt } : {}),
  };
}

export function toUserModStatusView(doc: Doc<"userModeration">): Record<string, unknown> {
  return {
    linkId: doc.linkId,
    accountStatus: doc.accountStatus,
    ...(doc.scope !== undefined ? { scope: doc.scope } : {}),
    ...(doc.reason !== undefined ? { reason: doc.reason } : {}),
    ...(doc.by !== undefined ? { by: doc.by } : {}),
    ...(doc.at !== undefined ? { at: doc.at } : {}),
    ...(doc.until !== undefined ? { until: doc.until } : {}),
    ...(doc.relatedReportId !== undefined ? { relatedReportId: doc.relatedReportId } : {}),
  };
}
