// THROWAWAY dev seeder for the DESIGN-008 slicing demo — DELETE after testing.
// Inserts identity-free voteEvents with randomized segment answers (+ a light bias so slices
// show a real pattern), then call tally:runOne on the returned ballotKey to fold them.

import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { getPoll } from "./lib/polls.model";
import { buildSegKey } from "./lib/slicing.logic";
import { insertVoteEvent } from "./lib/votes.model";
import { ballotKey, MAIN_EDITION } from "./lib/constants/poll";

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export const seed = internalMutation({
  args: { pollId: v.string(), count: v.optional(v.number()) },
  handler: async (ctx, { pollId, count }) => {
    const poll = await getPoll(ctx, pollId);
    if (!poll) throw new Error("poll not found");
    const schema = poll.segmentSchema ?? [];
    const optIds = poll.options.map((o) => o.id);
    const bKey = ballotKey(poll.pollId, MAIN_EDITION);
    const veg = schema.find((s) => s.label.toLowerCase().includes("vegetarian"));
    const n = count ?? 40;

    for (let k = 0; k < n; k++) {
      const answers: Record<string, string> = {};
      for (const seg of schema) answers[seg.id] = pick(seg.options).label;
      const segKey = buildSegKey(answers, schema);
      // Light bias: vegetarians lean toward the 2nd option (e.g. "No" on "do you eat seafood?").
      const firstProb = veg && answers[veg.id] === "Yes" ? 0.2 : 0.6;
      const optionId = Math.random() < firstProb ? optIds[0] : optIds[1];
      await insertVoteEvent(ctx, bKey, optionId, 1, undefined, segKey);
    }
    return { inserted: n, ballotKey: bKey };
  },
});
