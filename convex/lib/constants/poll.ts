// Poll + vote domain constants — ported from backend/shared/src/constants/items.ts and
// the per-service constants files. Enum STRING VALUES are wire contracts (the frontend
// types in src/lib/types.ts key off them) — never change casually.

export const POLL_AUDIENCE = {
  COMMUNITY: "COMMUNITY",
  LINK: "LINK",
} as const;
export type PollAudience = (typeof POLL_AUDIENCE)[keyof typeof POLL_AUDIENCE];

export const POLL_TYPE = {
  BINARY: "binary",
  MULTI: "multi",
} as const;
export type PollType = (typeof POLL_TYPE)[keyof typeof POLL_TYPE];

export const POLL_VISIBILITY = {
  PUBLIC: "public",
  PROTECTED: "protected",
  PRIVATE: "private",
} as const;
export type PollVisibility = (typeof POLL_VISIBILITY)[keyof typeof POLL_VISIBILITY];

export const BALLOT_MODE = {
  STANDARD: "standard",
  ANONYMOUS: "anonymous",
} as const;
export type BallotMode = (typeof BALLOT_MODE)[keyof typeof BALLOT_MODE];

export const RECURRENCE = {
  NONE: "NONE",
  DAILY: "DAILY",
  WEEKLY: "WEEKLY",
  MONTHLY: "MONTHLY",
  YEARLY: "YEARLY",
  MANUAL: "MANUAL",
} as const;
export type Recurrence = (typeof RECURRENCE)[keyof typeof RECURRENCE];

export const POLL_STATUS = {
  ACTIVE: "ACTIVE",
  CLOSED: "CLOSED",
  DELETED: "DELETED",
} as const;
export type PollStatus = (typeof POLL_STATUS)[keyof typeof POLL_STATUS];

export const EDITION_STATUS = {
  OPEN: "OPEN",
  CLOSED: "CLOSED",
} as const;
export type EditionStatus = (typeof EDITION_STATUS)[keyof typeof EDITION_STATUS];

/** Platform-takedown state on a poll (moderation; OK is the implicit default). */
export const POLL_MOD_STATUS = {
  OK: "OK",
  TAKEN_DOWN: "TAKEN_DOWN",
} as const;

/** The single edition label of non-recurring (NONE) and fresh MANUAL polls. */
export const MAIN_EDITION = "main";

export const VOTE_TRUST = {
  VALID: "valid",
  SUSPECT: "suspect",
  INVALID: "invalid",
} as const;
export type VoteTrust = (typeof VOTE_TRUST)[keyof typeof VOTE_TRUST];

/** The Votes partition: every vote on one poll-edition shares this key. */
export function ballotKey(pollId: string, editionLabel: string): string {
  return `${pollId}#${editionLabel}`;
}

export const POLL_LIMITS = {
  questionMin: 1,
  questionMax: 300,
  optionsMin: 2,
  optionsMax: 20,
  optionIdMax: 40,
  optionLabelMin: 1,
  optionLabelMax: 120,
  tagsMax: 10,
  tagMax: 40,
  categoryMax: 40,
  timezoneMax: 64,
  editionLabelMax: 32,
} as const;

export const BINARY_OPTION_COUNT = 2;

export const VOTE_LIMITS = {
  optionIdMax: 40,
  guestNameMin: 1,
  guestNameMax: 40,
  shareTokenMax: 64,
} as const;

export const FEED_PAGE = {
  defaultLimit: 20,
  maxLimit: 50,
} as const;

/** Home feed: newest polls scanned per subscribed community before hot-ranking. The hot
 *  score's age decay makes polls older than this window non-contenders, so a bounded scan
 *  per community captures every realistic candidate without reading whole communities. */
export const HOME_CANDIDATE_PER_COMMUNITY = 50;

/** Discover: newest publicly-listable polls scanned before hot-ranking. Bounds the global
 *  feed's read cost; the hot score's age decay makes anything older a non-contender. */
export const DISCOVER_CANDIDATE_SCAN = 200;

/** Discover topic chips: how many trending tags to surface from the scanned pool. The chips
 *  are derived (hot-weighted), not curated — they are literally "what's hot" right now. */
export const TRENDING_TAGS_MAX = 8;

/** Feed comment counts are capped at one index page; render as "N+" beyond this. */
export const COMMENT_COUNT_CAP = 100;

/** Edition-history picker: the most-recent editions listed for a recurring poll. A long-running
 *  daily poll accrues one row per day; the picker shows this many newest (older ones are pruned
 *  from the list, not the data — deep history would page later if ever needed). */
export const EDITION_HISTORY_MAX = 60;

export const DEFAULT_AUDIENCE = POLL_AUDIENCE.COMMUNITY;
export const DEFAULT_VISIBILITY = POLL_VISIBILITY.PUBLIC;
export const DEFAULT_BALLOT_MODE = BALLOT_MODE.STANDARD;
export const DEFAULT_RECURRENCE = RECURRENCE.NONE;

/** Share card: reveal the result breakdown by default (the viral hook); creators can opt out. */
export const DEFAULT_SHARE_CARD_SHOW_RESULTS = true;

// ── Tally pipeline (DESIGN-006 §5) ──────────────────────────────────────────

// ── Tally scheduler (DESIGN-009: self-scheduled dirty-set drain) ────────────
// Wake-on-vote, not scan-on-timer. A vote marks its ballot dirty and arms ONE drain
// per shard; the drain folds dirty ballots in K-sized batches and re-arms only while
// work remains. Job count tracks SHARDS (W), never poll count. Tune later (§4b.2).

/** W — independent drain lanes. At most one drain queued per shard ⇒ ≤W drains in flight. */
export const TALLY_SHARDS = 16;

/** K — dirty ballots folded per drainShard pass. Tx budget ≈ K×DRAIN_PAGE event reads. */
export const DRAIN_BATCH = 20;

/** voteEvents folded per ballot per pass; a full page means backlog remains → catch-up. */
export const DRAIN_PAGE = 256;

/** Debounce before a queued drain fires — the publish window the optimistic overlay hides. */
export const DRAIN_DEBOUNCE_MS = 2500;

/** Liveness backstop cadence: the safety sweep re-arms dropped drains this often (§4b.8). */
export const SAFETY_SWEEP_SECONDS = 30;

/** A drainScheduled shard whose lastArmedAt is older than this is presumed dead → re-armed. */
export const DRAIN_STALE_MS = 15_000;

/** Flattened demographic dimension keys on voteEvents ("gender#male", "seg:<id>#<answer>"). */
export const TALLY_DIMENSION = {
  GENDER: "gender",
  AGE: "age",
  REGION: "region",
} as const;

export const SEGMENT_DIM_PREFIX = "seg:";

export function dimKey(dimension: string, value: string): string {
  return `${dimension}#${value}`;
}
