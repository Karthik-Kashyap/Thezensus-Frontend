// UI-facing constants, labels, and route builders. No magic strings scattered in components.

import type {
  HoldReason,
  ModActionType,
  Recurrence,
  ReportCategory,
  ReportResolution,
  ReportTarget,
  SubjectType,
  UserReportCategory,
  Visibility,
} from "./types";

/** Must mirror auth-service constants/profile.ts GENDER_OPTIONS. */
export const GENDER_OPTIONS = [
  "female",
  "male",
  "nonbinary",
  "other",
  "prefer_not_to_say",
] as const;

/** Must mirror auth-service notif channels. */
export const NOTIF_CHANNELS = ["email", "push"] as const;

export const VISIBILITY_OPTIONS: { value: Visibility; label: string; hint: string }[] = [
  { value: "public", label: "Public", hint: "Anyone can find, view, and vote." },
  { value: "protected", label: "Protected", hint: "Anyone can view; only members vote." },
  { value: "private", label: "Private", hint: "Members only — for orgs & cohorts." },
];

export const RECURRENCE_OPTIONS: { value: Recurrence; label: string }[] = [
  { value: "NONE", label: "One-time" },
  { value: "DAILY", label: "Daily" },
  { value: "WEEKLY", label: "Weekly" },
  { value: "MONTHLY", label: "Monthly" },
  { value: "YEARLY", label: "Yearly" },
];

// JPEG/PNG only — Rekognition DetectModerationLabels (the moderation gate, DESIGN-007)
// doesn't accept WebP, so we don't accept uploads it can't scan. Re-add WebP with a
// transcode step in the Lambda later.
export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png"] as const;
export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
/** Poll question/option images — larger cap than avatars (SCRATCH-009 §10.5). */
export const MAX_POLL_IMAGE_BYTES = 10 * 1024 * 1024;

/**
 * User-reportable categories for the report dialog (a subset of the backend REPORT_CATEGORY enum;
 * APPEAL/USER_ESCALATION are not user-filed here). Must mirror moderation-service constants.
 */
export const REPORT_CATEGORY_OPTIONS: { value: UserReportCategory; label: string }[] = [
  { value: "HARASSMENT", label: "Harassment or bullying" },
  { value: "HATE", label: "Hate speech" },
  { value: "VIOLENCE_THREAT", label: "Violence or threats" },
  { value: "SELF_HARM", label: "Self-harm" },
  { value: "SPAM", label: "Spam or scam" },
  { value: "CSAM", label: "Child sexual abuse material" },
  { value: "ILLEGAL_OTHER", label: "Other illegal content" },
  { value: "OTHER", label: "Something else" },
];

// ── Moderation admin console (admin-only surface) ─────────────────────────────

/** Display labels for EVERY report category — the admin queue surfaces system-filed ones too. */
export const REPORT_CATEGORY_LABELS: Record<ReportCategory, string> = {
  CSAM: "Child sexual abuse material",
  HARASSMENT: "Harassment or bullying",
  HATE: "Hate speech",
  VIOLENCE_THREAT: "Violence or threats",
  SELF_HARM: "Self-harm",
  SPAM: "Spam or scam",
  ILLEGAL_OTHER: "Other illegal content",
  USER_ESCALATION: "Escalated by a community mod",
  APPEAL: "Account appeal",
  OTHER: "Something else",
};

/** Category options for the queue filter (all categories; the UI adds an "All" entry). */
export const ADMIN_QUEUE_CATEGORIES: { value: ReportCategory; label: string }[] = (
  Object.keys(REPORT_CATEGORY_LABELS) as ReportCategory[]
).map((value) => ({ value, label: REPORT_CATEGORY_LABELS[value] }));

export const QUEUE_ORDER_OPTIONS: { value: "newest" | "oldest"; label: string }[] = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
];

export const REPORT_RESOLUTION_OPTIONS: { value: ReportResolution; label: string; hint: string }[] = [
  { value: "ACTION_TAKEN", label: "Action taken", hint: "Report upheld — you enforced against the target." },
  { value: "DISMISSED", label: "Dismissed", hint: "No violation found; nothing to enforce." },
  { value: "DUPLICATE", label: "Duplicate", hint: "Already covered by another report on this target." },
];

export const SUSPEND_MODE_OPTIONS: { value: "SUSPENDED" | "BANNED"; label: string; hint: string }[] = [
  { value: "SUSPENDED", label: "Suspend (temporary)", hint: "Blocked from acting until a date you set." },
  { value: "BANNED", label: "Ban (permanent)", hint: "Permanent — only a manual reinstate lifts it." },
];

export const HOLD_REASON_OPTIONS: { value: HoldReason; label: string }[] = [
  { value: "LE_REQUEST", label: "Law-enforcement request" },
  { value: "CSAM_PRESERVE", label: "CSAM preservation" },
  { value: "INVESTIGATION", label: "Internal investigation" },
  { value: "LITIGATION", label: "Litigation" },
];

export const SUBJECT_TYPE_OPTIONS: { value: SubjectType; label: string }[] = [
  { value: "USER", label: "User" },
  { value: "POLL", label: "Poll" },
  { value: "COMMENT", label: "Comment" },
  { value: "MEDIA", label: "Media" },
];

export const REPORT_TARGET_LABELS: Record<ReportTarget, string> = {
  POLL: "Poll",
  COMMENT: "Comment",
  USER: "User",
  COMMUNITY: "Community",
};

/** Human labels for the immutable audit-log action verbs. */
export const MOD_ACTION_LABELS: Record<ModActionType, string> = {
  SUSPEND: "Suspended user",
  UNSUSPEND: "Reinstated user",
  BAN: "Banned user",
  TAKEDOWN: "Took down content",
  RESTORE: "Restored content",
  PRESERVE: "Preserved media",
  HOLD_OPEN: "Opened legal hold",
  HOLD_RELEASE: "Released legal hold",
  DISMISS_REPORT: "Dismissed report",
  BAN_FROM_COMMUNITY: "Banned from community",
  NCMEC_FILED: "Filed NCMEC report",
  WARN_REPORTER: "Warned reporter",
};

/**
 * Live feed vote counts (DESIGN-010). Viewport-gated, counts-only, hard-capped live
 * subscriptions on feed cards. OFF by default — set NEXT_PUBLIC_LIVE_FEED_COUNTS=1 to
 * enable. With it off, PollCard behaves exactly as before (static snapshot counts).
 */
export const LIVE_FEED = {
  // Accept 1/true/yes/on (any case) — avoids the "I set it to `true` but it read as off" trap.
  enabled: ["1", "true", "yes", "on"].includes(
    (process.env.NEXT_PUBLIC_LIVE_FEED_COUNTS ?? "").trim().toLowerCase(),
  ),
  /** Hard cap on concurrent NORMAL slots. Pins (just-voted) are extra + viewport-bound. */
  maxLiveCards: 4,
  /** Continuous on-screen time before a card subscribes (fast scroll opens nothing). */
  dwellMs: 2000,
  /** Delay before releasing a slot on scroll-out — anti-thrash on the viewport edge. */
  exitGraceMs: 750,
  /** "In view" = at least this fraction of the card OR of the viewport is covered. */
  visibleFraction: 0.5,
} as const;

/** Member-question (segment) editor limits — mirrors COMMUNITY_LIMITS in community-service. */
export const SEGMENT_LIMITS = {
  questionsMax: 8,
  optionsMin: 2,
  optionsMax: 12,
  labelMax: 120,
  optionMax: 60,
} as const;

/** Centralized route builders so links never hardcode path shapes. */
export const routes = {
  home: "/",
  me: "/me",
  signup: "/signup",
  admin: "/admin",
  adminReport: (reportId: string) => `/admin/reports/${encodeURIComponent(reportId)}`,
  // The path segment is a linkId (ADR-006); the /profile/[userId] folder name is kept for stability.
  profile: (linkId: string) => `/profile/${encodeURIComponent(linkId)}`,
  community: (id: string) => `/c/${encodeURIComponent(id)}`,
  communityManage: (id: string) => `/c/${encodeURIComponent(id)}/manage`,
  newCommunity: "/c/new",
  poll: (id: string, token?: string) =>
    token ? `/poll/${encodeURIComponent(id)}?token=${encodeURIComponent(token)}` : `/poll/${encodeURIComponent(id)}`,
  newPoll: (communityId?: string) =>
    communityId ? `/poll/new?community=${encodeURIComponent(communityId)}` : "/poll/new",
} as const;
