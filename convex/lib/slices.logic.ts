// Pure DTO-assembly helpers for the paywalled slice query (DESIGN-008 §D). NO ctx, NO db
// — these turn the requested segment ids + a suppressed cross-tab slice into a clean,
// label-resolved DTO so convex/slices.ts stays thin orchestration (one I/O concern per
// line). The positional segKey math lives in lib/slicing.logic.ts; this module only
// resolves indices back to human labels against the poll's FROZEN segment schema.

import {
  parseSegKey,
  type SegmentSchemaEntry,
} from "./slicing.logic";
import { SEGKEY_UNANSWERED } from "./constants/slicing";

/** The "unanswered" bucket's display label (segKey index 0 — its own natural bucket). */
export const UNANSWERED_LABEL = "Unanswered";

/** A resolved request: one selected segment, paired with its position in the schema. */
export interface SelectedSegment {
  id: string;
  label: string;
  pos: number;
}

/** One cross-tab cell after slicing + suppression, resolved to human labels. */
export interface SliceCell {
  /** segmentId → the chosen option's label (or "Unanswered") for this cell. */
  values: Record<string, string>;
  /** optionId → count (the poll-answer breakdown within this segment combination). */
  counts: Record<string, number>;
  /** Sum of `counts` — the cell's voter total (always ≥ the suppression floor). */
  total: number;
}

/**
 * Resolve the viewer's requested segment ids against the poll's frozen schema, in ascending
 * `pos` order (the order sliceCrosstab packs sub-keys in). Throws via the injected `reject`
 * for unknown ids, duplicates, or ids whose `pos` is not in `crossable` (beyond the row
 * budget → not sliceable). Returning ascending-by-pos keeps `pos` order the single source of
 * truth for both the slice call and sub-key decoding.
 */
export function resolveSelectedSegments(
  dims: string[],
  schema: SegmentSchemaEntry[],
  crossable: number[],
  reject: (message: string) => Error,
): SelectedSegment[] {
  const byId = new Map(schema.map((s) => [s.id, s]));
  const crossableSet = new Set(crossable);

  const seen = new Set<string>();
  const selected: SelectedSegment[] = [];
  for (const id of dims) {
    if (seen.has(id)) throw reject(`Duplicate dimension: ${id}`);
    seen.add(id);

    const segment = byId.get(id);
    if (!segment) throw reject(`Unknown dimension: ${id}`);
    if (!crossableSet.has(segment.pos)) {
      throw reject(`Dimension not sliceable (beyond the cross-tab budget): ${id}`);
    }
    selected.push({ id: segment.id, label: segment.label, pos: segment.pos });
  }

  // Ascending pos — the order sliceCrosstab emits sub-key positions in.
  return selected.sort((a, b) => a.pos - b.pos);
}

/** Map one segment's stored option index back to its display label (0 ⇒ "Unanswered"). */
function optionLabel(segment: SegmentSchemaEntry, index: number): string {
  if (index === Number(SEGKEY_UNANSWERED)) return UNANSWERED_LABEL;
  const option = segment.options.find((o) => o.i === index);
  return option?.label ?? UNANSWERED_LABEL;
}

/**
 * Turn a suppressed slice (sub-key → optionId → count) into label-resolved cells. The
 * sub-key is the selected positions' option indices in ascending `pos` order (joined by the
 * segKey delimiter), so it lines up position-for-position with `selected`. A cell's `values`
 * map each selected segment id to its chosen option's label; `total` is the summed count.
 */
export function buildSliceCells(
  suppressed: Record<string, Record<string, number>>,
  selected: SelectedSegment[],
  schemaById: Map<string, SegmentSchemaEntry>,
): SliceCell[] {
  const cells: SliceCell[] = [];
  for (const [subKey, counts] of Object.entries(suppressed)) {
    const indices = parseSegKey(subKey);

    const values: Record<string, string> = {};
    selected.forEach((seg, slot) => {
      const segment = schemaById.get(seg.id)!;
      values[seg.id] = optionLabel(segment, indices[slot] ?? Number(SEGKEY_UNANSWERED));
    });

    let total = 0;
    for (const count of Object.values(counts)) total += count;

    cells.push({ values, counts, total });
  }
  return cells;
}
