// Moderation / enforcement constants — ported from backend/shared/src/constants/
// moderation.ts. Enum string values are wire contracts with src/lib/types.ts.

/** Platform account enforcement state. Absent userModeration doc ⇒ ACTIVE. */
export const ACCOUNT_STATUS = {
  ACTIVE: "ACTIVE",
  SUSPENDED: "SUSPENDED", // temporary — carries `until`
  BANNED: "BANNED", // permanent
} as const;

export type AccountStatus = (typeof ACCOUNT_STATUS)[keyof typeof ACCOUNT_STATUS];

export const REPORT_CATEGORY = {
  CSAM: "CSAM",
  HARASSMENT: "HARASSMENT",
  HATE: "HATE",
  VIOLENCE_THREAT: "VIOLENCE_THREAT",
  SELF_HARM: "SELF_HARM",
  SPAM: "SPAM",
  ILLEGAL_OTHER: "ILLEGAL_OTHER",
  USER_ESCALATION: "USER_ESCALATION",
  APPEAL: "APPEAL", // system-filed via the appeals endpoint, never user-picked
  OTHER: "OTHER",
} as const;
export type ReportCategory = (typeof REPORT_CATEGORY)[keyof typeof REPORT_CATEGORY];

export const REPORT_STATUS = {
  OPEN: "OPEN",
  UNDER_REVIEW: "UNDER_REVIEW",
  RESOLVED: "RESOLVED",
} as const;

export const REPORT_RESOLUTION = {
  ACTION_TAKEN: "ACTION_TAKEN",
  DISMISSED: "DISMISSED",
  DUPLICATE: "DUPLICATE",
} as const;
export type ReportResolution = (typeof REPORT_RESOLUTION)[keyof typeof REPORT_RESOLUTION];

export const REPORT_TARGET = {
  POLL: "POLL",
  COMMENT: "COMMENT",
  USER: "USER",
  COMMUNITY: "COMMUNITY",
} as const;
export type ReportTarget = (typeof REPORT_TARGET)[keyof typeof REPORT_TARGET];

export const MOD_SCOPE = {
  COMMUNITY: "COMMUNITY",
  PLATFORM: "PLATFORM",
} as const;

/** What a legal hold / mod action is keyed against. */
export const SUBJECT_TYPE = {
  USER: "USER",
  POLL: "POLL",
  COMMENT: "COMMENT",
  MEDIA: "MEDIA",
} as const;
export type SubjectType = (typeof SUBJECT_TYPE)[keyof typeof SUBJECT_TYPE];

export const MOD_ACTION = {
  SUSPEND: "SUSPEND",
  UNSUSPEND: "UNSUSPEND",
  BAN: "BAN",
  TAKEDOWN: "TAKEDOWN",
  RESTORE: "RESTORE",
  PRESERVE: "PRESERVE",
  HOLD_OPEN: "HOLD_OPEN",
  HOLD_RELEASE: "HOLD_RELEASE",
  DISMISS_REPORT: "DISMISS_REPORT",
  BAN_FROM_COMMUNITY: "BAN_FROM_COMMUNITY",
  NCMEC_FILED: "NCMEC_FILED",
  WARN_REPORTER: "WARN_REPORTER",
} as const;
export type ModActionType = (typeof MOD_ACTION)[keyof typeof MOD_ACTION];

export const HOLD_REASON = {
  LE_REQUEST: "LE_REQUEST",
  CSAM_PRESERVE: "CSAM_PRESERVE",
  INVESTIGATION: "INVESTIGATION",
  LITIGATION: "LITIGATION",
} as const;
export type HoldReason = (typeof HOLD_REASON)[keyof typeof HOLD_REASON];

export const HOLD_STATUS = {
  ACTIVE: "ACTIVE",
  RELEASED: "RELEASED",
  EXPIRED: "EXPIRED",
} as const;

/** Content takedown state on polls/comments (OK is the implicit default). */
export const CONTENT_MOD_STATUS = {
  OK: "OK",
  TAKEN_DOWN: "TAKEN_DOWN",
} as const;

export const MODERATION_LIMITS = {
  reasonMax: 1000,
  caseRefMax: 200,
} as const;

export const QUEUE_PAGE = {
  defaultLimit: 50,
  maxLimit: 100,
} as const;

// ── Key builders (DDB-era formats kept — they're in DTOs the frontend reads) ──

export function reportTargetKey(targetType: string, targetId: string): string {
  return `${targetType}#${targetId}`;
}

/** Sparse category-queue key: present while OPEN, stripped on resolve. */
export function reportQueueCat(category: string): string {
  return `OPEN#${category}`;
}

export function subjectKey(subjectType: string, subjectId: string): string {
  return `${subjectType}#${subjectId}`;
}
