// Pure tally helpers (DESIGN-009): the shard hash + the in-memory fold accumulation.
// NO ctx, NO db — pure functions, so they're unit-testable in isolation and let the
// registered drain functions in tally.ts stay thin. The fold math is the single-writer
// math lifted verbatim from the old `runOne`, now shared by foldSnapshot.

import { foldCrosstabEvent } from "./slicing.logic";
import { TALLY_SHARDS } from "./constants/poll";

/**
 * Deterministic FNV-1a shard assignment for a ballotKey — NO Math.random, so the same
 * ballot always lands on the same lane across runs/processes (required: the drain claims
 * a shard's dirty ballots, and no two shards may share a ballot — DESIGN-009 §4b.3).
 */
export function shardFor(ballotKey: string): number {
  let h = 2166136261;
  for (let i = 0; i < ballotKey.length; i++) {
    h ^= ballotKey.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % TALLY_SHARDS;
}

/** The tally's running sums for one ballot (the persisted shape minus its watermark). */
export interface TallySums {
  counts: Record<string, number>;
  dimCounts: Record<string, Record<string, number>>;
  crosstab: Record<string, Record<string, number>>;
  totalVotes: number;
}

/** The slice of a voteEvents row the fold consumes. */
export interface FoldEvent {
  optionId: string;
  delta: number;
  dims?: string[];
  segKey?: string;
}

/** Deep-copy a two-level count record so folding never mutates the prior (snapshot) state. */
function cloneCounts(src?: Record<string, Record<string, number>>): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const [key, inner] of Object.entries(src ?? {})) out[key] = { ...inner };
  return out;
}

/**
 * Fold a watermark-bounded page of events onto the prior running sums, returning FRESH
 * objects (no aliasing of `prior`). Counts are accumulated then SET by the caller —
 * re-folding the same snapshot is idempotent, so overlapping/duplicate drains are safe.
 */
export function foldEvents(prior: TallySums | null, events: FoldEvent[]): TallySums {
  const counts: Record<string, number> = { ...(prior?.counts ?? {}) };
  const dimCounts = cloneCounts(prior?.dimCounts);
  const crosstab = cloneCounts(prior?.crosstab);
  let totalVotes = prior?.totalVotes ?? 0;

  for (const e of events) {
    counts[e.optionId] = (counts[e.optionId] ?? 0) + e.delta;
    totalVotes += e.delta;
    for (const dim of e.dims ?? []) {
      const perOption = (dimCounts[dim] ??= {});
      perOption[e.optionId] = (perOption[e.optionId] ?? 0) + e.delta;
    }
    if (e.segKey) foldCrosstabEvent(crosstab, e.segKey, e.optionId, e.delta);
  }
  return { counts, dimCounts, crosstab, totalVotes };
}
