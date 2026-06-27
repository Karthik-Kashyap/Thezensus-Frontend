// Slices API — the "break down results" read surface (DESIGN-008 §D). Two queries, two
// distinct rails by design:
//
//   • getSlice — the PAYWALLED community-SEGMENT cross-tab. Combines the viewer's chosen
//     segments into a joint breakdown computed server-side from the single cross-tab doc.
//     The tier paywall is enforced HERE, before any heavy work: a free account that asks
//     for more dimensions than its tier allows gets a 403 and zero cells — the full table
//     never leaves the backend (that's the whole point; if the data reached the browser the
//     paywall would be trivially bypassable).
//
//   • getDemographicBreakdown — a FREE, anonymous-friendly, SINGLE demographic dimension
//     (age/country/state/gender) read straight off editionResults.dimCounts. These are flat
//     MARGINALS that never cross each other, so there's no paywall and no joint math — just
//     a k-anonymity suppress over one dimension's values.
//
// I/O only (style matches votes.ts): validate args, resolve actor/tier/poll, call the pure
// helpers in lib/slicing.logic.ts + lib/slices.logic.ts + lib/demographics.logic.ts, return the DTO.

import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { optionalActor, requireActor } from "./lib/actor";
import { badRequest, forbidden, notFound } from "./lib/errors";
import { ballotKey } from "./lib/constants/poll";
import { MIN_CELL_VOTERS } from "./lib/constants/slicing";
import { isHidden, canViewPoll } from "./lib/polls.logic";
import { currentEditionLabel } from "./lib/editions.logic";
import { getPoll } from "./lib/polls.model";
import { getResults } from "./lib/votes.model";
import {
  crossablePositions,
  sliceCrosstab,
  suppressSmallCells,
  tierDimLimit,
} from "./lib/slicing.logic";
import {
  resolveSelectedSegments,
  buildSliceCells,
} from "./lib/slices.logic";
import { buildDemographicBreakdown } from "./lib/demographics.logic";

/**
 * GET a paywalled cross-tab slice. `dims` = the community SEGMENT IDs to combine. The tier
 * gate runs FIRST (before the poll/results reads) so an over-limit request never triggers
 * any compute and the over-limit cells are never serialized. Empty `crosstab` (no votes yet,
 * or a LINK / pre-DESIGN-008 poll with no segments) returns an empty slice, not an error.
 */
export const getSlice = query({
  args: {
    pollId: v.string(),
    dims: v.array(v.string()),
    token: v.optional(v.string()),
    edition: v.optional(v.string()),
  },
  handler: async (ctx, { pollId, dims, token, edition }) => {
    const actor = await requireActor(ctx);

    // ── Paywall: resolve tier and reject BEFORE any heavy work (DESIGN-008 §D). ──
    // The users doc _id IS the linkId (ADR-006); absent tier ⇒ free.
    const user = await ctx.db.get(actor.linkId as Id<"users">);
    const limit = tierDimLimit(user?.tier);
    if (dims.length > limit) {
      throw forbidden(`Your tier can combine at most ${limit} dimensions`);
    }

    // ── View access (existence is never leaked — match votes.ts getMine). ──
    const poll = await getPoll(ctx, pollId);
    if (!poll || isHidden(poll) || !(await canViewPoll(ctx, poll, actor.linkId, token))) {
      throw notFound("Poll not found");
    }

    const schema = poll.segmentSchema ?? [];

    // ── Map requested ids → positions; reject unknown / non-crossable / duplicate. ──
    const crossable = crossablePositions(schema);
    const selected = resolveSelectedSegments(dims, schema, crossable, badRequest);

    // ── Resolve the edition and point-read its results doc. ──
    const label = edition ?? currentEditionLabel(poll);
    const results = await getResults(ctx, ballotKey(poll.pollId, label));

    const dimsDto = selected.map((s) => ({ id: s.id, label: s.label }));

    // No results doc yet (no votes / not tallied) → an empty but well-formed slice.
    if (!results) {
      return {
        pollId: poll.pollId,
        edition: label,
        dims: dimsDto,
        cells: [],
        suppressedBelow: MIN_CELL_VOTERS,
      };
    }

    // ── Slice the cross-tab, then k≥5 suppress. Convert each selected segment's pos → its
    // SLOT index: its rank in the pos-sorted frozen schema, which is exactly how buildSegKey
    // lays out the key. Slots (not raw pos) so a gap in pos — e.g. an archived middle
    // segment — still slices the right column. ──
    const orderedPos = [...schema].sort((a, b) => a.pos - b.pos).map((s) => s.pos);
    const slots = selected.map((s) => orderedPos.indexOf(s.pos));
    const sliced = sliceCrosstab(results.crosstab ?? {}, slots, schema.length);
    const suppressed = suppressSmallCells(sliced);

    const schemaById = new Map(schema.map((s) => [s.id, s]));
    const cells = buildSliceCells(suppressed, selected, schemaById);

    return {
      pollId: poll.pollId,
      edition: label,
      dims: dimsDto,
      cells,
      suppressedBelow: MIN_CELL_VOTERS,
    };
  },
});

/**
 * GET one demographic dimension's marginal breakdown (gender | age | country | state). FREE and
 * anonymous-friendly — unlike getSlice's paywalled cross-tab, this is k-anonymized PUBLIC
 * aggregate, read straight off editionResults.dimCounts with NO crossing and no tier gate. The
 * data is already folded per edition by the tally; this only filters to the requested dimension,
 * suppresses below-floor groups, and orders the rows.
 *
 * Returns null when the poll is missing / not visible (mirrors polls.get so the live subscriber
 * renders the not-found state without an error boundary); an empty `rows` when nothing's been
 * tallied yet or every value sits below the suppression floor.
 */
export const getDemographicBreakdown = query({
  args: {
    pollId: v.string(),
    dimension: v.union(
      v.literal("gender"),
      v.literal("age"),
      v.literal("country"),
      v.literal("state"),
    ),
    token: v.optional(v.string()),
    edition: v.optional(v.string()),
  },
  handler: async (ctx, { pollId, dimension, token, edition }) => {
    const actor = await optionalActor(ctx);

    // View access only — same gate as the poll read queries (existence never leaked for LINK polls).
    const poll = await getPoll(ctx, pollId);
    if (!poll || isHidden(poll) || !(await canViewPoll(ctx, poll, actor?.linkId ?? null, token))) {
      return null;
    }

    const label = edition ?? currentEditionLabel(poll);
    const results = await getResults(ctx, ballotKey(poll.pollId, label));
    const rows = buildDemographicBreakdown(results?.dimCounts, dimension, MIN_CELL_VOTERS);

    return {
      pollId: poll.pollId,
      edition: label,
      dimension,
      rows,
      suppressedBelow: MIN_CELL_VOTERS,
    };
  },
});
