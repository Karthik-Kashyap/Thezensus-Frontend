// Votes API — the vote-service surface (cast / change / getMine). The write path is
// the load-tested core (REVIEW-002): voter-owned inserts/patches only, dedup by index
// read (OCC range conflict = conditional put), counting deferred to the tally.
// DTOs mirror src/lib/types.ts CastVoteResult / MyVote.

import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { optionalActor, requireActor } from "./lib/actor";
import { badRequest, notFound } from "./lib/errors";
import { newGuestVoter } from "./lib/ids";
import { BALLOT_MODE, VOTE_TRUST, VOTE_LIMITS, ballotKey } from "./lib/constants/poll";
import { isHidden, canViewPoll } from "./lib/polls.logic";
import { getPoll, ensureEdition } from "./lib/polls.model";
import {
  assertCanVote,
  resolveVotingEdition,
  assertValidOption,
  demographicsSnapshot,
  toDims,
  voteSegKey,
} from "./lib/votes.logic";
import { getVote, insertVote, changeVoteRow, insertVoteEvent } from "./lib/votes.model";
import { bumpUserStats } from "./lib/users.model";
import { noteVote } from "./tally";

/** POST /votes — cast. Guests allowed on LINK polls (token-gated); attributable votes
 *  dedup one-per-edition; anonymous-ballot and guest votes never dedup. */
export const cast = mutation({
  args: {
    pollId: v.string(),
    optionId: v.string(),
    token: v.optional(v.string()),
    guestName: v.optional(v.string()),
  },
  handler: async (ctx, { pollId, optionId, token, guestName }) => {
    if (optionId.length === 0 || optionId.length > VOTE_LIMITS.optionIdMax) {
      throw badRequest("Invalid option");
    }
    if (
      guestName !== undefined &&
      (guestName.length < VOTE_LIMITS.guestNameMin || guestName.length > VOTE_LIMITS.guestNameMax)
    ) {
      throw badRequest("Invalid guest name");
    }

    const actor = await optionalActor(ctx);
    // The platform ban gate applies to signed-in voters (requireActor re-resolves + gates).
    if (actor) await requireActor(ctx);

    const poll = await getPoll(ctx, pollId);
    if (!poll || isHidden(poll)) throw notFound("Poll not found");
    assertValidOption(poll, optionId);
    await assertCanVote(ctx, poll, actor?.linkId ?? null, token);
    const { label } = await resolveVotingEdition(ctx, poll, { assertOpen: true });

    const bKey = ballotKey(poll.pollId, label);
    await ensureEdition(ctx, poll.pollId, label);

    // Attributable (dedup-able) only when signed in AND the ballot is standard mode.
    const attributable = actor !== null && poll.ballotMode === BALLOT_MODE.STANDARD;

    if (attributable) {
      const existing = await getVote(ctx, bKey, actor!.linkId);
      if (existing) {
        return { status: "alreadyVoted", pollId: poll.pollId, edition: label, optionId: existing.optionId };
      }
      const snapshot = await demographicsSnapshot(ctx, actor!.linkId, poll);
      const segKey = voteSegKey(snapshot, poll);
      await insertVote(ctx, {
        ballotKey: bKey,
        voter: actor!.linkId,
        optionId,
        trust: VOTE_TRUST.VALID,
        linkId: actor!.linkId,
        ...(snapshot ? { demographics: snapshot } : {}),
      });
      await insertVoteEvent(ctx, bKey, optionId, 1, toDims(snapshot), segKey);
      // Own-doc counter (DESIGN-011): the voter's own userStats, attributable votes only.
      // Guest/anonymous votes carry no linkId, so they never count toward votesCast.
      await bumpUserStats(ctx, actor!.linkId, { votesCast: 1 });
    } else {
      // Guest or anonymous-ballot vote: fresh random voter id, never dedups, no
      // identity, no demographics (unlinkable by construction).
      await insertVote(ctx, {
        ballotKey: bKey,
        voter: newGuestVoter(),
        optionId,
        trust: VOTE_TRUST.VALID,
        ...(guestName !== undefined ? { guestName } : {}),
      });
      await insertVoteEvent(ctx, bKey, optionId, 1);
    }

    // Register (if new) + mark the ballot dirty + arm its drain — the wake-on-vote trigger.
    await noteVote(ctx, bKey, poll.pollId, poll.creatorId);
    return { status: "accepted", pollId: poll.pollId, edition: label, optionId };
  },
});

/** POST /votes/change — move an existing vote (signed-in, standard ballots only). */
export const change = mutation({
  args: {
    pollId: v.string(),
    optionId: v.string(),
    token: v.optional(v.string()),
  },
  handler: async (ctx, { pollId, optionId, token }) => {
    const actor = await requireActor(ctx);

    const poll = await getPoll(ctx, pollId);
    if (!poll || isHidden(poll)) throw notFound("Poll not found");
    if (poll.ballotMode !== BALLOT_MODE.STANDARD) {
      throw badRequest("Votes on anonymous ballots can't be changed");
    }
    assertValidOption(poll, optionId);
    await assertCanVote(ctx, poll, actor.linkId, token);
    const { label } = await resolveVotingEdition(ctx, poll, { assertOpen: true });

    const bKey = ballotKey(poll.pollId, label);
    const existing = await getVote(ctx, bKey, actor.linkId);
    if (!existing) {
      return { status: "alreadyVoted", pollId: poll.pollId, edition: label, optionId };
    }
    if (existing.optionId === optionId) {
      return { status: "unchanged", pollId: poll.pollId, edition: label, optionId };
    }

    // Move: patch the voter-owned row; emit −old/+new deltas carrying the ROW'S
    // snapshotted dims + segKey (interim demographic edits never rewrite history).
    const dims = toDims(existing.demographics);
    const segKey = voteSegKey(existing.demographics, poll);
    await changeVoteRow(ctx, existing, optionId);
    await insertVoteEvent(ctx, bKey, existing.optionId, -1, dims, segKey);
    await insertVoteEvent(ctx, bKey, optionId, 1, dims, segKey);

    // The −old/+new deltas need folding too — wake the tally for this ballot. No votesCast
    // bump: a move isn't a new cast, and the edition's totalVotes (creator roll-up) is
    // unchanged, so the drain's delta is naturally 0.
    await noteVote(ctx, bKey, poll.pollId, poll.creatorId);
    return { status: "changed", pollId: poll.pollId, edition: label, optionId };
  },
});

/** GET /votes?pollId= — the caller's own vote on the CURRENT edition (read-your-write). */
export const getMine = query({
  args: { pollId: v.string(), token: v.optional(v.string()) },
  handler: async (ctx, { pollId, token }) => {
    const actor = await requireActor(ctx);

    const poll = await getPoll(ctx, pollId);
    // VIEW access, not vote access — a viewer who can't vote still probes their vote.
    if (!poll || !(await canViewPoll(ctx, poll, actor.linkId, token))) {
      throw notFound("Poll not found");
    }
    const edition = await resolveVotingEdition(ctx, poll, { assertOpen: false });

    // Anonymous ballots aren't keyed by voter — there is never a "my vote" to read.
    const row =
      poll.ballotMode === BALLOT_MODE.STANDARD
        ? await getVote(ctx, ballotKey(poll.pollId, edition.label), actor.linkId)
        : null;

    return {
      pollId: poll.pollId,
      edition: edition.label,
      editionStatus: edition.status,
      windowState: edition.windowState,
      vote: row
        ? { optionId: row.optionId, votedAt: new Date(row.votedAt).toISOString(), version: row.version }
        : null,
    };
  },
});
