// Slices API — the paywalled cross-tab read surface (DESIGN-008 §D). ONE query: getSlice
// combines the viewer's chosen community SEGMENTS into a joint breakdown, computed
// server-side from the single cross-tab doc. The paywall is enforced HERE, before any
// heavy work: a free account that asks for more dimensions than its tier allows gets a 403
// and zero cells — the full table never leaves the backend (that's the whole point; if the
// data reached the browser the paywall would be trivially bypassable).
//
// Scope: SEGMENT cross-tab slicing only. Demographic marginals (age/region/gender) live in
// editionResults.dimCounts and are a separate, free, single-dimension read — out of scope.
//
// I/O only (style matches votes.ts): validate args, resolve actor/tier/poll, call the pure
// helpers in lib/slicing.logic.ts + lib/slices.logic.ts, return the DTO.

import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireActor } from "./lib/actor";
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
