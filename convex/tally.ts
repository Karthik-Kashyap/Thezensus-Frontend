// The tally — the SINGLE WRITER of tallyState + editionResults (DESIGN-006 §5; the
// pattern that survived the gate run). DESIGN-009 replaces the old scan-on-timer tick
// with a WAKE-ON-VOTE, dirty-set drain:
//
//   • A vote marks its ballot dirty (cheap, per-ballot) and — only on the clean→dirty
//     edge — arms ONE drain for that ballot's shard (noteVote/arm). Idle ⇒ nothing runs.
//   • `drainShard` (an ACTION) claims a batch of dirty ballots, folds each from a QUERY
//     snapshot (foldSnapshot) and blind-writes the published counts in a MUTATION
//     (publishBallot) — so the fold can never OCC-conflict with voting (REVIEW-002 rule
//     #3) — then re-arms itself only while work remains (rearmOrRest).
//   • A tiny O(shards) `safetySweep` cron re-arms any shard whose self-scheduled drain
//     was dropped (dead action). Folds are idempotent, so a redundant drain is harmless.
//
// Job count tracks SHARDS (W=TALLY_SHARDS), never poll count. The watermark fold math,
// editionResults shape, and every read-path query are unchanged from the single-writer
// design. See DESIGN-009 §4b for the full contention/correctness analysis.

import { v } from "convex/values";
import type { MutationCtx } from "./_generated/server";
import { internalAction, internalQuery, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  POLL_STATUS,
  TALLY_SHARDS,
  DRAIN_BATCH,
  DRAIN_PAGE,
  DRAIN_DEBOUNCE_MS,
  DRAIN_STALE_MS,
  ballotKey,
} from "./lib/constants/poll";
import { currentEditionLabel } from "./lib/editions.logic";
import { getPoll } from "./lib/polls.model";
import { bumpUserStats } from "./lib/users.model";
import { shardFor, foldEvents, type TallySums } from "./lib/tally.logic";
import {
  getTallyState,
  getResults,
  getRegistryEntry,
  voteEventsSince,
  getControl,
  claimDirtyBallots,
  hasDirtyBallot,
  latestVoteEvent,
} from "./lib/votes.model";

// ── Vote path: mark dirty + arm (the only hot-path addition) ─────────────────

/**
 * Called once per vote, AFTER the voteEvents insert, from votes.ts cast/change (§4b.4).
 * Marks the ballot dirty and — only on the clean→dirty edge — arms a single drain for its
 * shard. The vast majority of votes hit the "already dirty → do nothing" branch (a ballot
 * is clean only for the first vote of each ~debounce window), so steady-state votes add
 * just one already-done point read; no shared-doc write per vote (C1).
 */
export async function noteVote(
  ctx: MutationCtx,
  ballot: string,
  pollId: string,
  creatorId: string,
): Promise<void> {
  const reg = await getRegistryEntry(ctx, ballot);
  const now = Date.now();

  if (!reg) {
    // First vote on this edition: register dirty + arm. Stamp the poll's creator so the
    // drain can roll this edition's votes into their totalVotesReceived (DESIGN-011).
    const shard = shardFor(ballot);
    await ctx.db.insert("tallyRegistry", { ballotKey: ballot, pollId, creatorId, shard, dirtySince: now });
    await arm(ctx, shard);
    return;
  }

  if (reg.dirtySince === 0) {
    await ctx.db.patch(reg._id, { dirtySince: now }); // clean → dirty edge
    await arm(ctx, reg.shard);
  }
  // already dirty → no write, no schedule. This is the coalescing.
}

/** Ensure at most one drain is queued for a shard (the scheduling coalescer). */
async function arm(ctx: MutationCtx, shard: number): Promise<void> {
  const ctrl = await getControl(ctx, shard);
  if (!ctrl) {
    await ctx.db.insert("tallyControl", { shard, drainScheduled: true, lastArmedAt: Date.now() });
  } else if (!ctrl.drainScheduled) {
    await ctx.db.patch(ctrl._id, { drainScheduled: true, lastArmedAt: Date.now() });
  } else {
    return; // a drain is already queued for this shard — nothing to do
  }
  await ctx.scheduler.runAfter(DRAIN_DEBOUNCE_MS, internal.tally.drainShard, { shard });
}

// ── Drain: claim → fold → publish → re-arm ──────────────────────────────────

/** A folded snapshot of one ballot, ready to publish. */
interface FoldResult extends TallySums {
  newWatermark: number;
  pageFull: boolean; // page came back full ⇒ backlog remains
  hadEvents: boolean; // nothing new since the watermark ⇒ skip the write
}

/**
 * Orchestrates one drain pass for a shard. Per-ballot it reads votes in a QUERY snapshot
 * (never participates in OCC) and writes only tally-owned docs in a MUTATION — so the fold
 * can never conflict with voting. Re-arms while its shard still has work (§4b.5).
 */
export const drainShard = internalAction({
  args: { shard: v.number() },
  handler: async (ctx, { shard }): Promise<void> => {
    const ballots: string[] = await ctx.runQuery(internal.tally.claimDirty, { shard, limit: DRAIN_BATCH });

    let catchUp = false;
    for (const ballot of ballots) {
      const fold: FoldResult = await ctx.runQuery(internal.tally.foldSnapshot, { ballotKey: ballot, page: DRAIN_PAGE });
      const fullyDrained: boolean = await ctx.runMutation(internal.tally.publishBallot, { ballotKey: ballot, ...fold });
      if (!fullyDrained) catchUp = true; // > DRAIN_PAGE pending, or a straggler arrived
    }

    // Keep the chain alive iff work remains — decided atomically with the dirty-set read (§4b.7).
    await ctx.runMutation(internal.tally.rearmOrRest, { shard, catchUp });
  },
});

/** The dirty ballots of one shard, oldest-dirtied first (FIFO). */
export const claimDirty = internalQuery({
  args: { shard: v.number(), limit: v.number() },
  handler: async (ctx, { shard, limit }): Promise<string[]> => claimDirtyBallots(ctx, shard, limit),
});

/**
 * Fold one watermark-bounded page of voteEvents into the running sums. READS votes from a
 * consistent snapshot; pure compute, no writes — so it never OCC-conflicts with the vote path.
 */
export const foldSnapshot = internalQuery({
  args: { ballotKey: v.string(), page: v.number() },
  handler: async (ctx, { ballotKey: ballot, page }): Promise<FoldResult> => {
    const state = await getTallyState(ctx, ballot);
    const watermark = state?.watermark ?? 0;
    const events = await voteEventsSince(ctx, ballot, watermark, page); // .gt(_creationTime, watermark)

    const prior: TallySums | null = state
      ? {
          counts: state.counts,
          dimCounts: state.dimCounts ?? {},
          crosstab: state.crosstab ?? {},
          totalVotes: state.totalVotes,
        }
      : null;
    const sums = foldEvents(prior, events);

    return {
      ...sums,
      newWatermark: events.length ? events[events.length - 1]._creationTime : watermark,
      pageFull: events.length === page,
      hadEvents: events.length > 0,
    };
  },
});

/**
 * WRITES the tally-owned docs (tallyState/editionResults) from the snapshot, then clears the
 * ballot's dirty flag. Counts are SET (not incremented) → idempotent: a duplicate drain
 * re-folding the same snapshot writes the same value. Returns whether the ballot is fully
 * drained; false means "stay dirty, come back" (backlog remains, or a straggler landed in
 * the snapshot→publish gap). Touches no votes except one tail read (the gap fix).
 */
export const publishBallot = internalMutation({
  args: {
    ballotKey: v.string(),
    counts: v.record(v.string(), v.number()),
    dimCounts: v.record(v.string(), v.record(v.string(), v.number())),
    crosstab: v.record(v.string(), v.record(v.string(), v.number())),
    totalVotes: v.number(),
    newWatermark: v.number(),
    pageFull: v.boolean(),
    hadEvents: v.boolean(),
  },
  handler: async (ctx, a): Promise<boolean> => {
    // Read once; reused for the creator roll-up (below) and retirement (bottom).
    const reg = await getRegistryEntry(ctx, a.ballotKey);

    if (a.hadEvents) {
      const state = await getTallyState(ctx, a.ballotKey);
      const stateDoc = {
        ballotKey: a.ballotKey,
        watermark: a.newWatermark,
        counts: a.counts,
        dimCounts: a.dimCounts,
        crosstab: a.crosstab,
        totalVotes: a.totalVotes,
      };
      if (state) await ctx.db.patch(state._id, stateDoc);
      else await ctx.db.insert("tallyState", stateDoc);

      const published = await getResults(ctx, a.ballotKey);
      const resultsDoc = {
        ballotKey: a.ballotKey,
        counts: a.counts,
        dimCounts: a.dimCounts,
        crosstab: a.crosstab,
        totalVotes: a.totalVotes,
        publishedAt: Date.now(),
      };
      if (published) await ctx.db.patch(published._id, resultsDoc);
      else await ctx.db.insert("editionResults", resultsDoc);

      // Roll this edition's NEW votes into the creator's lifetime total (DESIGN-011).
      // delta = new published total − prior published total = exactly the votes folded
      // this pass. Computed against the just-read prior, so a duplicate/retried drain
      // re-reads the already-updated total → delta 0 → no double-count (idempotent, like
      // the SET above). The write is the tally's, off the vote path; OCC conflicts between
      // two of a creator's ballots draining at once retry and converge. Skipped when the
      // registry row predates the creatorId backfill (transition only — backfillUserStats
      // re-derives the truth regardless).
      const delta = a.totalVotes - (published?.totalVotes ?? 0);
      if (delta !== 0 && reg?.creatorId) {
        await bumpUserStats(ctx, reg.creatorId, { totalVotesReceived: delta });
      }
    }

    if (a.pageFull) return false; // backlog remains → stay dirty, drain catches up

    // GAP FIX (snapshot→publish): a vote landing between foldSnapshot and here hits
    // noteVote's "already dirty → do nothing" branch, so it neither re-arms nor bumps
    // dirtySince. Clearing the flag now would strand it (safetySweep ignores clean ballots).
    // So tail-read the newest event; if anything sits above our snapshot watermark, STAY
    // DIRTY and let the chain return. This single-row read can OCC-conflict with a concurrent
    // insert, but the retry lands HERE (votes still only insert) and on retry sees the new
    // event → self-healing. Converges: the catch-up pass folds the straggler, then this read
    // finds nothing newer and clears.
    const latest = await latestVoteEvent(ctx, a.ballotKey);
    if (latest && latest._creationTime > a.newWatermark) return false;

    // Fully caught up. Clear dirty, OR retire the row if the edition is no longer current
    // (the old tick's retirement logic, moved here). editionResults stays forever.
    if (reg) {
      const poll = await getPoll(ctx, reg.pollId);
      const isCurrent =
        poll !== null &&
        poll.status !== POLL_STATUS.DELETED &&
        reg.ballotKey === ballotKey(poll.pollId, currentEditionLabel(poll));
      if (isCurrent) await ctx.db.patch(reg._id, { dirtySince: 0 }); // clean
      else await ctx.db.delete(reg._id); // retire
    }
    return true;
  },
});

/**
 * Disarm the shard, or reschedule the chain if work remains (§4b.7). Reading the shard's
 * dirty range in the SAME transaction that disarms is what prevents a lost wakeup: a vote
 * that dirties a ballot concurrently forces an OCC retry here that re-sees the work.
 */
export const rearmOrRest = internalMutation({
  args: { shard: v.number(), catchUp: v.boolean() },
  handler: async (ctx, { shard, catchUp }) => {
    const more = await hasDirtyBallot(ctx, shard);
    const ctrl = await getControl(ctx, shard);

    if (more || catchUp) {
      // Stamp lastArmedAt on every reschedule = proof-of-life for safetySweep. If a pass
      // dies before reaching here, lastArmedAt freezes and the sweep recovers the shard.
      if (ctrl) await ctx.db.patch(ctrl._id, { drainScheduled: true, lastArmedAt: Date.now() });
      await ctx.scheduler.runAfter(catchUp ? 0 : DRAIN_DEBOUNCE_MS, internal.tally.drainShard, { shard });
    } else if (ctrl) {
      await ctx.db.patch(ctrl._id, { drainScheduled: false }); // disarm; next vote re-arms
    }
  },
});

// ── Safety net (liveness, O(shards) not O(polls)) ───────────────────────────

/**
 * Liveness backstop (§4b.8). drainShard is an ACTION — not auto-retried, not transactional
 * — so one can die mid-pass after `arm` set drainScheduled=true, leaving the flag stuck.
 * This sweep therefore does NOT trust drainScheduled: it re-arms any dirty shard whose drain
 * is missing or looks dead (lastArmedAt older than DRAIN_STALE_MS). It is NOT the old tick:
 * W existence-check point reads, never a whole-registry scan. Idempotent folds make a
 * redundant drain harmless.
 */
export const safetySweep = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    for (let shard = 0; shard < TALLY_SHARDS; shard++) {
      if (!(await hasDirtyBallot(ctx, shard))) continue; // shard clean → skip
      const ctrl = await getControl(ctx, shard);
      // Trust a drain ONLY if its flag is set AND fresh. A stuck flag (dead action) is
      // treated as "no drain" → re-armed. This is the whole point of the backstop.
      const live = ctrl?.drainScheduled === true && now - (ctrl.lastArmedAt ?? 0) < DRAIN_STALE_MS;
      if (live) continue;
      if (ctrl) await ctx.db.patch(ctrl._id, { drainScheduled: true, lastArmedAt: now });
      else await ctx.db.insert("tallyControl", { shard, drainScheduled: true, lastArmedAt: now });
      await ctx.scheduler.runAfter(0, internal.tally.drainShard, { shard });
    }
  },
});
