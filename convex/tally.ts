// The tally — the SINGLE WRITER of tallyState + editionResults (DESIGN-006 §5; the
// pattern that survived the 1,500/s gate run). A 5s cron tick scans the registry of
// live ballots; ballots with fresh voteEvents get a runOne scheduled. runOne tails
// the feed by `_creationTime` watermark (NEVER a persisted .paginate cursor —
// REVIEW-002 finding 6), folds deltas in memory, and blind-writes the published doc.
// Viewers subscribe to editionResults only: one push per publish, however hot the poll.

import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { POLL_STATUS, TALLY_PAGE_SIZE } from "./lib/constants/poll";
import { currentEditionLabel } from "./lib/editions.logic";
import { getPoll } from "./lib/polls.model";
import {
  listRegistry,
  getTallyState,
  getResults,
  voteEventsSince,
} from "./lib/votes.model";

/** Cron entry: schedule a fold for every registered ballot with unprocessed events;
 *  retire registry rows whose edition is over and drained. */
export const tick = internalMutation({
  args: {},
  handler: async (ctx) => {
    const registry = await listRegistry(ctx);
    for (const entry of registry) {
      const state = await getTallyState(ctx, entry.ballotKey);
      const watermark = state?.watermark ?? 0;
      const peek = await voteEventsSince(ctx, entry.ballotKey, watermark, 1);

      if (peek.length > 0) {
        await ctx.scheduler.runAfter(0, internal.tally.runOne, { ballotKey: entry.ballotKey });
        continue;
      }

      // Drained. Retire the registry row once this ballot can never see another vote:
      // poll gone/deleted, or the edition label has rolled past it. (editionResults
      // stays forever — it's the historical scoreboard.)
      const poll = await getPoll(ctx, entry.pollId);
      const ballotIsCurrent =
        poll !== null &&
        poll.status !== POLL_STATUS.DELETED &&
        entry.ballotKey === `${poll.pollId}#${currentEditionLabel(poll)}`;
      if (!ballotIsCurrent) await ctx.db.delete(entry._id);
    }
  },
});

/** Fold one watermark-bounded page of voteEvents into the running counts and publish.
 *  Reschedules itself immediately while pages come back full (catch-up mode). */
export const runOne = internalMutation({
  args: { ballotKey: v.string() },
  handler: async (ctx, { ballotKey }) => {
    const state = await getTallyState(ctx, ballotKey);
    const watermark = state?.watermark ?? 0;

    const page = await voteEventsSince(ctx, ballotKey, watermark, TALLY_PAGE_SIZE);
    if (page.length === 0) return; // nothing new — no write, no push to viewers

    const counts: Record<string, number> = { ...(state?.counts ?? {}) };
    const dimCounts: Record<string, Record<string, number>> = { ...(state?.dimCounts ?? {}) };
    let totalVotes = state?.totalVotes ?? 0;

    for (const event of page) {
      counts[event.optionId] = (counts[event.optionId] ?? 0) + event.delta;
      totalVotes += event.delta;
      for (const dim of event.dims ?? []) {
        const perOption = (dimCounts[dim] ??= {});
        perOption[event.optionId] = (perOption[event.optionId] ?? 0) + event.delta;
      }
    }
    const newWatermark = page[page.length - 1]._creationTime;

    // Query-snapshot → blind-write: nothing here was written by the vote path, so this
    // can never OCC-conflict with voting.
    if (state) {
      await ctx.db.patch(state._id, { watermark: newWatermark, counts, dimCounts, totalVotes });
    } else {
      await ctx.db.insert("tallyState", { ballotKey, watermark: newWatermark, counts, dimCounts, totalVotes });
    }

    const published = await getResults(ctx, ballotKey);
    const doc = { ballotKey, counts, dimCounts, totalVotes, publishedAt: Date.now() };
    if (published) {
      await ctx.db.patch(published._id, doc);
    } else {
      await ctx.db.insert("editionResults", doc);
    }

    if (page.length === TALLY_PAGE_SIZE) {
      await ctx.scheduler.runAfter(0, internal.tally.runOne, { ballotKey });
    }
  },
});
