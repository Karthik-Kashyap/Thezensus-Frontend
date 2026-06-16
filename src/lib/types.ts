// DTOs mirroring the implemented backend API (gateway /api/*). Grouped by service.
// Source of truth: backend service `types.ts` files + DB-TABLES.md. Keep in sync.

// ── Shared enums ───────────────────────────────────────────────────────────
export type Visibility = "public" | "protected" | "private";
export type PollType = "binary" | "multi";
export type AudienceType = "COMMUNITY" | "LINK";
export type Recurrence = "NONE" | "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY" | "MANUAL";
export type PollStatus = "ACTIVE" | "CLOSED" | "DELETED";
export type WindowState = "PENDING" | "ACTIVE" | "ENDED";
export type EditionStatus = "OPEN" | "CLOSED";
/** standard = attributable (powers analytics); anonymous = unlinkable, immutable after publish. */
export type BallotMode = "standard" | "anonymous";
/** Account enforcement state (ADR-006/moderation). Drives the suspended/appeal UX. */
export type AccountStatus = "ACTIVE" | "SUSPENDED" | "BANNED";

// ── Auth / profile (auth-service) ───────────────────────────────────────────
export interface ProfileStats {
  pollsCreated: number;
  totalVotesReceived: number;
  votesCast: number;
}

/**
 * The signed-in user's own profile (includes private settings). Identified by `linkId` (ADR-006 —
 * the public pseudonym; the real userId never leaves the auth-service). `age` is derived server-side
 * from the vault DOB and shown only on this own-view; it is never editable here (DOB is set once at
 * signup). `account` carries enforcement state so the client can render the suspended/appeal screen.
 */
export interface MeProfile {
  linkId: string;
  displayName: string;
  bio?: string;
  avatarMediaId?: string;
  avatarKey?: string;
  createdAt: string;
  stats: ProfileStats;
  demographics: {
    gender?: string;
    age?: number; // derived, read-only (own view only)
    region?: string;
    demographicsPublic: boolean;
    demographicsConsent: boolean;
  };
  settings: { email: string; notifPrefs: string[] };
  account: { status: AccountStatus; reason?: string; until?: string };
  /** Platform admin (holds the `ADMIN` item). Gates the admin/moderation console in the UI; the
   *  moderation-service still enforces per request. Optional so a pre-rebuild backend reads as false. */
  isAdmin?: boolean;
}

/** Another user's public profile (no settings/email/age; demographics only if public). */
export interface PublicProfile {
  linkId: string;
  displayName: string;
  bio?: string;
  avatarMediaId?: string;
  avatarKey?: string;
  createdAt: string;
  stats: ProfileStats;
  demographics?: { gender?: string; region?: string };
}

export interface UpdateProfileInput {
  displayName?: string;
  bio?: string;
  gender?: string;
  region?: string;
  demographicsPublic?: boolean;
  notifPrefs?: string[];
  avatarMediaId?: string;
}

// ── Signup / consent / deletion (auth-service) ──────────────────────────────
/** POST /auth/signup/complete — age gate + baseline consent for a first-time identity (ADR-008/009). */
export interface CompleteSignupInput {
  birthDate: string; // YYYY-MM-DD (full DOB; server enforces 13+)
  displayName?: string;
  consent: { demographics: boolean; marketingEmail: boolean };
}

/** GET /users/me/consent — latest state per purpose + the policy version stamped on events. */
export interface ConsentView {
  policyVersion: string;
  purposes: { demographics: boolean; marketing_email: boolean; age_13plus: boolean };
}

/** PUT /users/me/consent — toggle one or more purposes (append-only events server-side). */
export interface UpdateConsentInput {
  demographics?: boolean;
  marketingEmail?: boolean;
}

/** DELETE /users/me — summary of the deletion cascade (Phase-B row counts). */
export interface DeletionResult {
  linkId: string;
  deleted: { votes: number; subscriptions: number; media: number; consent: number; userItems: number };
}

// ── Communities (community-service) ─────────────────────────────────────────
export interface SegmentDef {
  id: string;
  label: string;
  options: string[];
  version?: number;
}

/** A member's role within a single community (community-service). Platform admin is separate. */
export type CommunityRole = "OWNER" | "MODERATOR";

export interface Community {
  communityId: string;
  name: string;
  description?: string;
  iconMediaId?: string;
  iconKey?: string;
  createdAt: string;
  subscriberCount: number;
  visibility: Visibility;
  tags?: string[];
  category?: string;
  rules?: string;
  segments?: SegmentDef[];
  pinnedPollIds?: string[];
  /** The viewer's own role here (OWNER/MODERATOR), or omitted for anon/non-mod viewers.
   *  Gates the management UI; the service re-checks the role on every mutating call. */
  myRole?: CommunityRole;
}

/** A role grant within a community (community-service GET /communities/:id/roles). */
export interface RoleView {
  linkId: string;
  role: CommunityRole;
  at: string;
  actor?: string;
}

/** A community ban (community-service GET /communities/:id/bans). */
export interface BanView {
  linkId: string;
  reason?: string;
  bannedBy: string;
  createdAt: string;
}

export interface CreateCommunityInput {
  name: string;
  description?: string;
  visibility?: Visibility;
  tags?: string[];
  category?: string;
  rules?: string;
  iconMediaId?: string;
  /** Owner-defined member questions, set at creation (not editable afterward). */
  segments?: SegmentDef[];
}

export interface Subscription {
  communityId: string;
  subscribedAt: string;
  segments: Record<string, string>;
}

/** Compact community card for list views (e.g. the sidebar's discover list). */
export interface CommunitySummary {
  communityId: string;
  name: string;
  subscriberCount: number;
  description?: string;
  iconKey?: string;
}

// ── Polls (poll-service) ─────────────────────────────────────────────────────
export interface PollOption {
  id: string;
  label: string;
  /** Denormalized READY serving key + media id for the option image. Resolved to a URL
   *  client-side via useMediaUrl (public CDN base, or presigned GET of the viewer's own
   *  media) — same pattern as avatarKey. */
  mediaId?: string;
  mediaKey?: string;
}

export interface EditionScoreboard {
  label: string;
  windowState: WindowState;
  status: EditionStatus;
  voteCount: number;
  optionCounts: Record<string, number>;
  /** Tally publish stamp (Convex); used to expire optimistic vote overlays. */
  publishedAt?: number;
}

export interface Poll {
  pollId: string;
  creatorId: string;
  /** The creator's display name, resolved server-side (absent if the profile is gone). */
  creatorDisplayName?: string;
  audienceType: AudienceType;
  communityId?: string;
  question: string;
  /** Question image (optional): denormalized serving key + media id, resolved like avatarKey. */
  questionMediaId?: string;
  questionMediaKey?: string;
  type: PollType;
  options: PollOption[];
  visibility?: Visibility;
  ballotMode: BallotMode;
  requireLoginToVote: boolean;
  recurrence: Recurrence;
  timezone?: string;
  recurrenceStart?: string;
  recurrenceEnd?: string;
  creatorIsMember?: boolean;
  shareToken?: string; // creator-only
  status: PollStatus;
  tags?: string[];
  category?: string;
  /** Creator's choice to reveal the result breakdown on the social share card. Absent = reveal. */
  shareCardShowResults?: boolean;
  createdAt: string;
  currentEdition: EditionScoreboard;
}

/**
 * Feed item — the compact poll plus the live current-edition scoreboard (so feed cards vote +
 * render results in place) and a count of visible comments. `commentCountCapped` true → the count
 * was capped at one DynamoDB page server-side; render it as "N+".
 */
export interface PollListItem {
  pollId: string;
  creatorId: string;
  creatorDisplayName?: string;
  audienceType: AudienceType;
  communityId?: string;
  question: string;
  questionMediaId?: string;
  questionMediaKey?: string;
  type: PollType;
  options: PollOption[];
  visibility?: Visibility;
  ballotMode: BallotMode;
  recurrence: Recurrence;
  recurrenceStart?: string;
  recurrenceEnd?: string;
  status: PollStatus;
  tags?: string[];
  category?: string;
  createdAt: string;
  currentEdition: EditionScoreboard;
  commentCount: number;
  commentCountCapped: boolean;
}

/**
 * The minimal poll shape the VotePanel needs to cast + show votes. Both the full `Poll` (detail
 * page) and the enriched `PollListItem` (feed cards) structurally satisfy it. `requireLoginToVote`
 * is optional because feed cards are always COMMUNITY polls — guest voting is a LINK-poll concern.
 */
export interface VotablePoll {
  pollId: string;
  /** The poll creator's linkId — the owner of any option/question media (for presign fallback). */
  creatorId: string;
  options: PollOption[];
  status: PollStatus;
  ballotMode: BallotMode;
  audienceType: AudienceType;
  requireLoginToVote?: boolean;
  currentEdition: EditionScoreboard;
}

export interface CreatePollInput {
  audienceType?: AudienceType;
  communityId?: string;
  question: string;
  questionMediaId?: string;
  type: PollType;
  options: { id: string; label: string; mediaId?: string }[];
  visibility?: Visibility;
  ballotMode?: BallotMode;
  requireLoginToVote?: boolean;
  recurrence?: Recurrence;
  timezone?: string;
  recurrenceStart?: string;
  recurrenceEnd?: string;
  tags?: string[];
  category?: string;
  shareCardShowResults?: boolean;
}

export interface Page<T> {
  items: T[];
  nextCursor?: string;
}

/**
 * The Discover feed response: hot-ranked cards plus the trending-tag chips (derived from the
 * same candidate pool, hot-weighted) that drive the topic filter. `tags` reflects the whole
 * pool regardless of the selected topic, so the chip row stays stable while filtering.
 */
export interface DiscoverFeedResult {
  items: PollListItem[];
  tags: string[];
}

// ── Votes (vote-service) ─────────────────────────────────────────────────────
export type CastStatus = "accepted" | "alreadyVoted" | "changed" | "unchanged";

export interface CastVoteInput {
  pollId: string;
  optionId: string;
  token?: string;
  guestName?: string;
}

export interface CastVoteResult {
  status: CastStatus;
  pollId: string;
  edition: string;
  optionId: string;
}

export interface MyVote {
  pollId: string;
  edition: string;
  editionStatus: EditionStatus;
  windowState: WindowState;
  vote: { optionId: string; votedAt: string; version: number } | null;
}

// ── Comments (comment-service) ───────────────────────────────────────────────
export type CommentStatus = "ACTIVE" | "REMOVED";

export interface Comment {
  pollId: string;
  commentId: string;
  authorId: string;
  text: string;
  status: CommentStatus;
  createdAt: string;
  updatedAt?: string;
}

// ── Media (media-service) ────────────────────────────────────────────────────
export type MediaKind = "avatar" | "community_icon" | "poll_question" | "poll_option";
export type MediaStatus =
  | "PENDING"
  | "UPLOADED"
  | "PROCESSING"
  | "READY"
  | "FAILED"
  | "REJECTED"
  | "PRESERVED";
// JPEG/PNG only — the moderation scanner (Rekognition) can't read WebP (see constants.ts).
export type MediaContentType = "image/jpeg" | "image/png";

export interface InitiateUploadInput {
  kind: MediaKind;
  contentType: MediaContentType;
  communityId?: string;
}

export interface InitiateUploadResult {
  mediaId: string;
  ownerId: string;
  kind: MediaKind;
  uploadUrl: string;
  stagingKey: string;
  expiresIn: number;
}

export interface MediaRecord {
  mediaId: string;
  ownerId: string;
  kind: MediaKind;
  status: MediaStatus;
  contentType: string;
  width?: number;
  height?: number;
  bytes?: number;
  urls?: { orig: string; med: string; thumb: string };
  createdAt: string;
  updatedAt?: string;
}

// ── Moderation (moderation-service) ──────────────────────────────────────────
/** Full report category set (mirrors backend REPORT_CATEGORY). The admin queue surfaces all of
 *  these; `APPEAL`/`USER_ESCALATION` are system-filed, not chosen in the user report dialog. */
export type ReportCategory =
  | "CSAM"
  | "HARASSMENT"
  | "HATE"
  | "VIOLENCE_THREAT"
  | "SELF_HARM"
  | "SPAM"
  | "ILLEGAL_OTHER"
  | "USER_ESCALATION"
  | "APPEAL"
  | "OTHER";

/** The categories a user may pick when filing a report (no APPEAL/USER_ESCALATION). */
export type UserReportCategory = Exclude<ReportCategory, "APPEAL" | "USER_ESCALATION">;

/** What a report points at. */
export type ReportTarget = "POLL" | "COMMENT" | "USER" | "COMMUNITY";

/** Report lifecycle + how a resolved one was decided. */
export type ReportStatus = "OPEN" | "UNDER_REVIEW" | "RESOLVED";
export type ReportResolution = "ACTION_TAKEN" | "DISMISSED" | "DUPLICATE";
/** Platform- vs community-scoped (v1 routes everything to the platform queue). */
export type ModScope = "COMMUNITY" | "PLATFORM";

/** POST /moderation/reports — file a report on any target. */
export interface CreateReportInput {
  category: UserReportCategory;
  targetType: ReportTarget;
  targetId: string;
  reason?: string;
  communityId?: string;
}

// ── Moderation admin console (moderation-service, admin-only) ─────────────────
/** What a legal hold / mod action is keyed against. */
export type SubjectType = "USER" | "POLL" | "COMMENT" | "MEDIA";
/** Why a subject is preserved (an ACTIVE hold blocks deletion + TTL). */
export type HoldReason = "LE_REQUEST" | "CSAM_PRESERVE" | "INVESTIGATION" | "LITIGATION";
export type HoldStatus = "ACTIVE" | "RELEASED" | "EXPIRED";
/** Audit-log action verbs (append-only ModActions). */
export type ModActionType =
  | "SUSPEND"
  | "UNSUSPEND"
  | "BAN"
  | "TAKEDOWN"
  | "RESTORE"
  | "PRESERVE"
  | "HOLD_OPEN"
  | "HOLD_RELEASE"
  | "DISMISS_REPORT"
  | "BAN_FROM_COMMUNITY"
  | "NCMEC_FILED"
  | "WARN_REPORTER";

/** A row in the Reports table (queue item + history). `queueState`/`queueCat` are sparse — present
 *  only while open, stripped on resolve. */
export interface Report {
  reportId: string;
  category: ReportCategory;
  status: ReportStatus;
  resolution?: ReportResolution;
  scope: ModScope;
  communityId?: string;
  targetType: ReportTarget;
  targetId: string;
  targetKey: string;
  reporterId: string;
  reason?: string;
  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  relatedActionId?: string;
  queueState?: string;
  queueCat?: string;
}

/** GET /moderation/reports/:id — one report + every report on the same target ("reported N times"). */
export interface ReportDetail {
  report: Report;
  related: Report[];
}

/** A row in the immutable ModActions audit log. */
export interface ModAction {
  targetKey: string;
  actionId: string;
  targetType: SubjectType;
  targetId: string;
  action: ModActionType;
  actorId: string;
  reason?: string;
  at: string;
  relatedReportId?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

/** The MOD_STATUS item returned by suspend (the enforcement state on a user). */
export interface UserModStatus {
  linkId: string;
  accountStatus: AccountStatus;
  scope: ModScope;
  reason?: string;
  by: string;
  at: string;
  until?: string;
  relatedReportId?: string;
}

/** A LegalHolds row (preservation override). */
export interface LegalHold {
  subjectKey: string;
  subjectType: SubjectType;
  subjectId: string;
  reason: HoldReason;
  caseRef?: string;
  status: HoldStatus;
  openedBy: string;
  openedAt: string;
  releasedAt?: string;
  expiresAt?: string;
}

// Admin request bodies.
export interface ResolveReportInput {
  resolution: ReportResolution;
  relatedActionId?: string;
}
export interface SuspendInput {
  mode: "SUSPENDED" | "BANNED";
  reason: string;
  until?: string; // ISO-8601 — required for SUSPENDED, ignored for BANNED
  relatedReportId?: string;
}
export interface TakedownInput {
  reason?: string;
  reportId?: string;
}
export interface CommentTakedownInput {
  pollId: string; // the Comments PK — not carried on the report, so the admin supplies it
  reason?: string;
  reportId?: string;
}
export interface PreserveMediaInput {
  ownerId: string; // the Media PK (linkId | communityId | pollId)
  reason?: string;
  reportId?: string;
}
export interface OpenHoldInput {
  subjectType: SubjectType;
  subjectId: string;
  reason: HoldReason;
  caseRef?: string;
  expiresAt?: string;
  relatedReportId?: string;
}
export interface ReleaseHoldInput {
  subjectType: SubjectType;
  subjectId: string;
}
