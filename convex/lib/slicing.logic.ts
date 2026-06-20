// Pure cross-tab / slicing helpers (DESIGN-008). NO ctx, NO db — pure functions only,
// so they're unit-testable in isolation and reusable from the vote path, the tally
// fold, and the slice query alike. The only dependency is the constants file.
//
// The positional segKey ("2.1.0.0.0") encodes each segment answer as its append-only
// option index at the segment's append-only position; "0" = unanswered. Slicing is a
// pattern-match-and-sum over those keys — see DESIGN-008 §"Why the positional key works".

import {
  AGE_BUCKETS,
  AGE_BUCKET_UNKNOWN,
  CROSSTAB_ROW_BUDGET,
  MIN_CELL_VOTERS,
  SEGKEY_DELIM,
  SEGKEY_UNANSWERED,
  TIER_DIM_LIMITS,
  type AccountTier,
} from "./constants/slicing";

/**
 * The frozen segment schema entry stored on a poll (polls.segmentSchema). Mirrors the
 * `segmentDef` schema shape; declared locally so this pure module has no Convex imports.
 */
export interface SegmentSchemaEntry {
  id: string;
  label: string;
  pos: number;
  options: { i: number; label: string }[];
  version?: number;
  archived?: boolean;
}

/** Map an age to its marginal bucket label, or AGE_BUCKET_UNKNOWN if out of range. */
export function bucketAge(age: number): string {
  for (const b of AGE_BUCKETS) {
    if (age >= b.min && age <= b.max) return b.label;
  }
  return AGE_BUCKET_UNKNOWN;
}

/**
 * Build the positional segKey from a voter's segment answers and the poll's frozen schema.
 * `answers` maps segment id → the chosen option's LABEL string (as stored on subscriptions).
 * Positions are emitted in ascending `pos` order; every position is present (archived
 * segments still occupy their slot). A missing answer or unknown label → SEGKEY_UNANSWERED.
 * Returns `undefined` when the schema is empty (LINK polls / pre-DESIGN-008 polls).
 */
export function buildSegKey(
  answers: Record<string, string>,
  schema: SegmentSchemaEntry[],
): string | undefined {
  if (schema.length === 0) return undefined;

  // Deterministic order by position — keep ALL positions so a key's slots are stable.
  const ordered = [...schema].sort((a, b) => a.pos - b.pos);

  const parts = ordered.map((segment) => {
    const answerLabel = answers[segment.id];
    if (answerLabel === undefined) return SEGKEY_UNANSWERED;
    const option = segment.options.find((o) => o.label === answerLabel);
    return option ? String(option.i) : SEGKEY_UNANSWERED;
  });

  return parts.join(SEGKEY_DELIM);
}

/** Split a segKey ("2.1.0.0.0") into its numeric position values. */
export function parseSegKey(key: string): number[] {
  return key.split(SEGKEY_DELIM).map((p) => Number(p));
}

/**
 * The positions (ascending `pos`) that fit inside the cross-tab row budget, included
 * greedily: a position joins only while the running product of option counts stays ≤
 * budget. Positions past the budget are excluded (they degrade to marginal-only).
 */
export function crossablePositions(
  schema: SegmentSchemaEntry[],
  budget: number = CROSSTAB_ROW_BUDGET,
): number[] {
  const ordered = [...schema].sort((a, b) => a.pos - b.pos);

  const included: number[] = [];
  let product = 1;
  for (const segment of ordered) {
    // Count answerable options only — the budget mirrors the creation cap (≤5 segments ×
    // ≤4 options = 4^5 = 1024). The reserved "unanswered" (0) bucket is NOT counted, so a
    // full 5×4 community keeps all 5 segments crossable rather than dropping the 5th.
    const optionCount = segment.options.length;
    const next = product * optionCount;
    if (next > budget) break; // first over-budget segment (and all after) are marginal-only
    product = next;
    included.push(segment.pos);
  }
  return included;
}

/** Fold one vote event into a running cross-tab in place: crosstab[segKey][optionId] += delta. */
export function foldCrosstabEvent(
  crosstab: Record<string, Record<string, number>>,
  segKey: string,
  optionId: string,
  delta: number,
): void {
  const row = (crosstab[segKey] ??= {});
  row[optionId] = (row[optionId] ?? 0) + delta;
}

/**
 * Collapse a full cross-tab down to only the `selectedSlots` — 0-based slot indices into the
 * segKey, where a slot = a segment's RANK in the poll's pos-sorted frozen schema (exactly how
 * buildSegKey lays out the key). Using slots, not raw `pos` values, keeps slicing correct when
 * positions are non-contiguous — e.g. after a middle segment is archived, leaving a gap in
 * `pos`. Every row is re-keyed by the index values at just those slots (joined by SEGKEY_DELIM,
 * in ascending slot order), summing per-optionId counts across all non-selected slots.
 * `totalPositions` (= the segKey width = frozen schema length) guards malformed keys.
 * Returns subKey → optionId → count.
 */
export function sliceCrosstab(
  crosstab: Record<string, Record<string, number>>,
  selectedSlots: number[],
  totalPositions: number,
): Record<string, Record<string, number>> {
  const indices = [...selectedSlots].sort((a, b) => a - b);

  const out: Record<string, Record<string, number>> = {};
  for (const [segKey, counts] of Object.entries(crosstab)) {
    const values = parseSegKey(segKey);
    if (values.length !== totalPositions) continue; // skip rows that don't match the schema width

    const subKey = indices.map((idx) => String(values[idx] ?? SEGKEY_UNANSWERED)).join(SEGKEY_DELIM);
    const row = (out[subKey] ??= {});
    for (const [optionId, count] of Object.entries(counts)) {
      row[optionId] = (row[optionId] ?? 0) + count;
    }
  }
  return out;
}

/**
 * k-anonymity suppression: drop any sub-key whose total voters (sum of its optionId
 * counts) is below `k`. Returns a NEW object; the input is left untouched.
 */
export function suppressSmallCells(
  sliced: Record<string, Record<string, number>>,
  k: number = MIN_CELL_VOTERS,
): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const [subKey, counts] of Object.entries(sliced)) {
    let total = 0;
    for (const count of Object.values(counts)) total += count;
    if (total >= k) out[subKey] = counts;
  }
  return out;
}

/** The max slice dimensions for a tier; unknown/absent tier ⇒ free limit. */
export function tierDimLimit(tier: string | undefined): number {
  return TIER_DIM_LIMITS[tier as AccountTier] ?? TIER_DIM_LIMITS.free;
}
