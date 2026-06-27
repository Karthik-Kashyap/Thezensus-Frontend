// Pure demographic-marginal helpers (DESIGN-008). NO ctx, NO db — turn the published
// editionResults.dimCounts (the flat "dim#value" → optionId → count marginals the tally
// folds) into ONE dimension's suppressed, ordered breakdown rows. Unlike the segment
// cross-tab (slices.logic.ts), demographic dims are MARGINALS — never crossed — so this is
// a filter-by-prefix + k-anonymity suppress + sort, with none of the positional-segKey math.

import { AGE_BUCKETS, AGE_BUCKET_UNKNOWN, MIN_CELL_VOTERS } from "./constants/slicing";

/** One demographic value's breakdown after prefix-strip + suppression. */
export interface DemographicRow {
  /** The marginal value with its "dim#" prefix stripped ("US", "US-CA", "female", "25-34"). */
  value: string;
  /** optionId → count among this value's voters (the poll-answer split within the group). */
  counts: Record<string, number>;
  /** Sum of `counts` — the group's voter total (always ≥ the suppression floor). */
  total: number;
}

// Age-bucket display order, with the catch-all "unknown" last; every other dimension sorts
// by descending size. Derived once from the bucket table so it can't drift from the buckets.
const AGE_ORDER: string[] = [...AGE_BUCKETS.map((b) => b.label), AGE_BUCKET_UNKNOWN];

/**
 * Extract one demographic dimension's marginal breakdown from a published dimCounts map. Keeps
 * only keys prefixed `"${dimension}#"`, strips that prefix to the bare value, drops any value
 * below the k-anonymity floor, and orders rows — age by its natural bucket order, every other
 * dimension by descending voter total (largest groups first). Returns [] when `dimCounts` is
 * absent (no votes / not yet tallied) or every value falls below `k`.
 */
export function buildDemographicBreakdown(
  dimCounts: Record<string, Record<string, number>> | undefined,
  dimension: string,
  k: number = MIN_CELL_VOTERS,
): DemographicRow[] {
  // Values are user/ISO strings that may themselves contain "#" — match the prefix only and
  // slice it off (never split), so "state#US-CA" → "US-CA" stays intact.
  const prefix = `${dimension}#`;
  const rows: DemographicRow[] = [];

  for (const [key, counts] of Object.entries(dimCounts ?? {})) {
    if (!key.startsWith(prefix)) continue;
    const value = key.slice(prefix.length);

    let total = 0;
    for (const c of Object.values(counts)) total += c;
    if (total < k) continue; // k-anonymity: never reveal a group below the floor

    rows.push({ value, counts, total });
  }

  if (dimension === "age") {
    rows.sort((a, b) => AGE_ORDER.indexOf(a.value) - AGE_ORDER.indexOf(b.value));
  } else {
    rows.sort((a, b) => b.total - a.total);
  }
  return rows;
}
