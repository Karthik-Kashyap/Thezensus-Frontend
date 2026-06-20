// Poll result slicing / cross-tab analytics constants (DESIGN-008). The positional
// segKey + cross-tab governance lives here; pure folding/slicing logic is in
// lib/slicing.logic.ts. Enum STRING VALUES (tier names) are wire contracts — never
// change casually (style matches lib/constants/poll.ts).

/** Max cross-tab rows = max product of crossed segments' option counts (5×4×… ceiling).
 *  Beyond this, segments degrade to marginal-only so the doc stays well under 1 MB. */
export const CROSSTAB_ROW_BUDGET = 1024;

/** k-anonymity floor — never reveal a cell representing fewer than this many voters.
 *  TEMP: dropped to 1 for dev testing — RESTORE TO 5 before launch. */
export const MIN_CELL_VOTERS = 1;

export const ACCOUNT_TIER = {
  FREE: "free",
  PRO: "pro",
} as const;
export type AccountTier = (typeof ACCOUNT_TIER)[keyof typeof ACCOUNT_TIER];

/** Max dimensions combinable in one slice per tier — the paid lever is combination depth. */
export const TIER_DIM_LIMITS: Record<AccountTier, number> = {
  free: 2,
  pro: 5,
};

/** Delimiter between positions in a segKey ("2.1.0.0.0") — keeps options 10–12 collision-free. */
export const SEGKEY_DELIM = ".";

/** The reserved per-position value for "no answer" — its own natural bucket. */
export const SEGKEY_UNANSWERED = "0";

/** Age marginal buckets (flat, never crossed). Top bucket is open (max 200 sentinel). */
export const AGE_BUCKETS: ReadonlyArray<{ min: number; max: number; label: string }> = [
  { min: 13, max: 17, label: "13-17" },
  { min: 18, max: 24, label: "18-24" },
  { min: 25, max: 34, label: "25-34" },
  { min: 35, max: 44, label: "35-44" },
  { min: 45, max: 54, label: "45-54" },
  { min: 55, max: 64, label: "55-64" },
  { min: 65, max: 200, label: "65+" },
];

/** Label for an age that falls outside every bucket (missing / under 13 / absurd). */
export const AGE_BUCKET_UNKNOWN = "unknown";
