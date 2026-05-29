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

// ── Auth / profile (auth-service) ───────────────────────────────────────────
export interface ProfileStats {
  pollsCreated: number;
  totalVotesReceived: number;
  votesCast: number;
}

/** The signed-in user's own profile (includes private settings). */
export interface MeProfile {
  userId: string;
  displayName: string;
  bio?: string;
  avatarMediaId?: string;
  avatarKey?: string;
  createdAt: string;
  stats: ProfileStats;
  demographics: {
    gender?: string;
    birthYear?: number;
    region?: string;
    demographicsPublic: boolean;
  };
  settings: { email: string; notifPrefs: string[] };
}

/** Another user's public profile (no settings; demographics only if public). */
export interface PublicProfile {
  userId: string;
  displayName: string;
  bio?: string;
  avatarMediaId?: string;
  avatarKey?: string;
  createdAt: string;
  stats: ProfileStats;
  demographics?: { gender?: string; birthYear?: number; region?: string };
}

export interface UpdateProfileInput {
  displayName?: string;
  bio?: string;
  gender?: string;
  birthYear?: number;
  region?: string;
  demographicsPublic?: boolean;
  notifPrefs?: string[];
  avatarMediaId?: string;
}

// ── Communities (community-service) ─────────────────────────────────────────
export interface SegmentDef {
  id: string;
  label: string;
  options: string[];
  version?: number;
}

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
}

export interface CreateCommunityInput {
  name: string;
  description?: string;
  visibility?: Visibility;
  tags?: string[];
  category?: string;
  rules?: string;
  iconMediaId?: string;
}

export interface Subscription {
  communityId: string;
  subscribedAt: string;
  segments: Record<string, string>;
}

// ── Polls (poll-service) ─────────────────────────────────────────────────────
export interface PollOption {
  id: string;
  label: string;
  mediaUrl?: string;
}

export interface EditionScoreboard {
  label: string;
  windowState: WindowState;
  status: EditionStatus;
  voteCount: number;
  optionCounts: Record<string, number>;
}

export interface Poll {
  pollId: string;
  creatorId: string;
  audienceType: AudienceType;
  communityId?: string;
  question: string;
  questionMediaUrl?: string;
  type: PollType;
  options: PollOption[];
  visibility?: Visibility;
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
  createdAt: string;
  currentEdition: EditionScoreboard;
}

/** Feed item — leaner than the detail (no scoreboard/edition). */
export interface PollListItem {
  pollId: string;
  creatorId: string;
  audienceType: AudienceType;
  communityId?: string;
  question: string;
  type: PollType;
  options: PollOption[];
  visibility?: Visibility;
  recurrence: Recurrence;
  status: PollStatus;
  tags?: string[];
  category?: string;
  createdAt: string;
}

export interface CreatePollInput {
  audienceType?: AudienceType;
  communityId?: string;
  question: string;
  type: PollType;
  options: { id: string; label: string; mediaId?: string }[];
  visibility?: Visibility;
  requireLoginToVote?: boolean;
  recurrence?: Recurrence;
  timezone?: string;
  recurrenceStart?: string;
  recurrenceEnd?: string;
  tags?: string[];
  category?: string;
}

export interface Page<T> {
  items: T[];
  nextCursor?: string;
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
export type MediaKind = "avatar" | "community_icon";
export type MediaStatus = "PENDING" | "PROCESSING" | "READY" | "FAILED" | "REJECTED";
export type MediaContentType = "image/jpeg" | "image/png" | "image/webp";

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
