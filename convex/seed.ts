// ⚠️ DEV-ONLY SEED SURFACE — NOT product code. Populates the dev deployment with
// fake-but-consistent content so the app feels alive before launch.
//
// Every export here is INTERNAL (internalMutation/internalAction) — they are NOT on the
// public client API and cannot be called by any browser/SDK client. The only way to run a
// seed is the `run` action below, invoked from the admin-authed Convex CLI/dashboard:
//   npx convex run seed:run                        # additive
//   npx convex run seed:run '{ "wipe": true }'     # clean slate first
// They are ALSO gated behind the ALLOW_SEED env var (set it ONLY on a dev deployment) as a
// second layer, and must never be enabled in prod.
//
// These reuse the REAL domain helpers (signup, the vote write-path, the edition engine), so
// every derived table — editions / votes / voteEvents / demographics / stats — ends up
// exactly as a real signup + vote would leave it. The tally cron then publishes
// editionResults on its own within ~5s; we also pre-write that doc so results show
// instantly (the tally recomputes the identical numbers from voteEvents and overwrites,
// never increments — so there's no double-count).

import { v } from "convex/values";
import { internalAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import usersCfgRaw from "./seed_data/users.json";
import commsCfgRaw from "./seed_data/communities.json";
import pollsCfgRaw from "./seed_data/polls.json";
import commentsCfgRaw from "./seed_data/comments.json";
import { completeSignup } from "./lib/signup.logic";
import { updateDemographics, bumpUserStats } from "./lib/users.model";
import { newPollId, newCommunityId, newCommentId, newShareToken, newGuestVoter } from "./lib/ids";
import {
  ballotKey,
  BALLOT_MODE,
  VOTE_TRUST,
  POLL_STATUS,
  POLL_AUDIENCE,
  DEFAULT_VISIBILITY,
  MAIN_EDITION,
} from "./lib/constants/poll";
import {
  COMMUNITY_ROLE,
  DEFAULT_COMMUNITY_VISIBILITY,
  COMMENT_STATUS,
} from "./lib/constants/community";
import { currentEditionLabel, computeEditionLabel, isTimeBased } from "./lib/editions.logic";
import { getPoll, ensureEdition } from "./lib/polls.model";
import { getCommunity } from "./lib/communities.model";
import { validateSegments } from "./lib/communities.logic";
import { demographicsSnapshot, toDims } from "./lib/votes.logic";
import { insertVote, insertVoteEvent, ensureRegistered } from "./lib/votes.model";

function assertSeedEnabled(): void {
  if (process.env.ALLOW_SEED !== "true") {
    throw new Error(
      "Seeding is disabled. Run `npx convex env set ALLOW_SEED true` on a DEV deployment to enable it (never on prod).",
    );
  }
}

// ── Users ─────────────────────────────────────────────────────────────────────

/** Creates persona accounts through the real signup transaction, then sets the
 *  PII-free demographics (gender/country/state) the breakdowns read. Returns index→linkId. */
export const seedUsers = internalMutation({
  args: {
    users: v.array(
      v.object({
        subject: v.string(), // fake Google sub, unique per run
        email: v.string(),
        displayName: v.string(),
        birthDate: v.string(), // YYYY-MM-DD, 13+
        bio: v.optional(v.string()),
        gender: v.optional(v.string()),
        country: v.optional(v.string()), // ISO-3166-1 alpha-2, e.g. "US"
        state: v.optional(v.string()), // ISO-3166-2, e.g. "US-CA"
        birthYear: v.optional(v.number()),
        demographicsPublic: v.optional(v.boolean()),
        demographicsConsent: v.optional(v.boolean()),
      }),
    ),
  },
  handler: async (ctx, { users }) => {
    assertSeedEnabled();
    const out: Array<{ index: number; linkId: string | null; displayName: string }> = [];
    for (let i = 0; i < users.length; i++) {
      const u = users[i];
      const consent = u.demographicsConsent ?? true;
      const res = await completeSignup(ctx, {
        subject: u.subject,
        email: u.email,
        legalName: u.displayName, // seed's name → PII vault only; public identity is the generated handle
        birthDate: u.birthDate,
        consent: { demographics: consent },
      });
      if (res.status === "underage") {
        out.push({ index: i, linkId: null, displayName: u.displayName });
        continue;
      }
      const linkId = res.linkId;
      if (u.bio) {
        const uid = ctx.db.normalizeId("users", linkId);
        if (uid) await ctx.db.patch(uid, { bio: u.bio });
      }
      await updateDemographics(ctx, linkId, {
        gender: u.gender,
        country: u.country,
        state: u.state,
        birthYear: consent ? u.birthYear : undefined,
        demographicsPublic: u.demographicsPublic ?? true,
        demographicsConsent: consent,
      });
      out.push({ index: i, linkId, displayName: u.displayName });
    }
    return out;
  },
});

// ── Communities ─────────────────────────────────────────────────────────────

const segmentInput = v.object({
  id: v.string(),
  label: v.string(),
  options: v.array(v.string()),
  version: v.optional(v.number()),
});

/** Idempotent by name (additive-safe): reuse an existing community of the same name,
 *  otherwise create it + its OWNER role. Then subscribe any members not already in. */
export const seedCommunities = internalMutation({
  args: {
    communities: v.array(
      v.object({
        name: v.string(),
        description: v.optional(v.string()),
        category: v.optional(v.string()),
        tags: v.optional(v.array(v.string())),
        visibility: v.optional(
          v.union(v.literal("public"), v.literal("protected"), v.literal("private")),
        ),
        rules: v.optional(v.string()),
        segments: v.optional(v.array(segmentInput)),
        ownerLinkId: v.string(),
        memberLinkIds: v.array(v.string()),
      }),
    ),
  },
  handler: async (ctx, { communities }) => {
    assertSeedEnabled();
    const existing = await ctx.db.query("communities").collect();
    const byName = new Map(existing.map((e) => [e.name, e.communityId]));
    const out: Array<{ name: string; communityId: string; created: boolean }> = [];

    for (const c of communities) {
      let communityId = byName.get(c.name);
      const created = communityId === undefined;
      if (communityId === undefined) {
        communityId = newCommunityId();
        await ctx.db.insert("communities", {
          communityId,
          name: c.name,
          ...(c.description ? { description: c.description } : {}),
          visibility: c.visibility ?? DEFAULT_COMMUNITY_VISIBILITY,
          subscriberCount: 0,
          ...(c.tags ? { tags: c.tags } : {}),
          ...(c.category ? { category: c.category } : {}),
          ...(c.rules ? { rules: c.rules } : {}),
          // c.segments carries option label strings; run through validateSegments (no prior
          // — fresh community) to assign the append-only pos + option `i` (DESIGN-008 §A).
          ...(c.segments ? { segments: validateSegments(c.segments) } : {}),
          createdBy: c.ownerLinkId,
        });
        await ctx.db.insert("communityRoles", {
          communityId,
          linkId: c.ownerLinkId,
          role: COMMUNITY_ROLE.OWNER,
        });
        byName.set(c.name, communityId);
      }

      let added = 0;
      for (const m of c.memberLinkIds) {
        const sub = await ctx.db
          .query("subscriptions")
          .withIndex("by_user_community", (q) => q.eq("linkId", m).eq("communityId", communityId!))
          .unique();
        if (!sub) {
          await ctx.db.insert("subscriptions", { linkId: m, communityId });
          added++;
        }
      }
      const comm = await getCommunity(ctx, communityId);
      if (comm && added > 0) {
        await ctx.db.patch(comm._id, { subscriberCount: comm.subscriberCount + added });
      }
      out.push({ name: c.name, communityId, created });
    }
    return out;
  },
});

// ── Polls (+ their editions, votes, voteEvents, results, comments) ────────────

/** One poll and everything that hangs off it, in one transaction. Mirrors the real
 *  create + vote write-paths so the data is indistinguishable from organic activity. */
export const seedPoll = internalMutation({
  args: {
    creatorLinkId: v.string(),
    audienceType: v.optional(v.union(v.literal("COMMUNITY"), v.literal("LINK"))),
    communityId: v.optional(v.string()),
    question: v.string(),
    type: v.union(v.literal("binary"), v.literal("multi")),
    options: v.array(v.object({ id: v.string(), label: v.string() })),
    ballotMode: v.optional(v.union(v.literal("standard"), v.literal("anonymous"))),
    visibility: v.optional(
      v.union(v.literal("public"), v.literal("protected"), v.literal("private")),
    ),
    recurrence: v.optional(
      v.union(
        v.literal("NONE"), v.literal("DAILY"), v.literal("WEEKLY"),
        v.literal("MONTHLY"), v.literal("YEARLY"), v.literal("MANUAL"),
      ),
    ),
    timezone: v.optional(v.string()),
    recurrenceStart: v.optional(v.string()),
    recurrenceEnd: v.optional(v.string()),
    status: v.optional(v.union(v.literal("ACTIVE"), v.literal("CLOSED"))),
    tags: v.optional(v.array(v.string())),
    category: v.optional(v.string()),
    votes: v.array(
      v.object({
        voterLinkId: v.optional(v.string()),
        guestName: v.optional(v.string()),
        optionId: v.string(),
      }),
    ),
    comments: v.optional(v.array(v.object({ authorLinkId: v.string(), text: v.string() }))),
  },
  handler: async (ctx, input) => {
    assertSeedEnabled();
    const pollId = newPollId();
    const audienceType = input.audienceType ?? POLL_AUDIENCE.COMMUNITY;
    const ballotMode = input.ballotMode ?? BALLOT_MODE.STANDARD;
    const recurrence = input.recurrence ?? "NONE";
    // Time-based recurrences derive the label from the clock; NONE/MANUAL use "main".
    const currentEdition = isTimeBased(recurrence)
      ? computeEditionLabel(recurrence, input.timezone)
      : MAIN_EDITION;
    const base = {
      pollId,
      creatorId: input.creatorLinkId,
      audienceType,
      question: input.question,
      type: input.type,
      options: input.options,
      ballotMode,
      requireLoginToVote: false,
      recurrence,
      ...(input.timezone ? { timezone: input.timezone } : {}),
      ...(input.recurrenceStart ? { recurrenceStart: input.recurrenceStart } : {}),
      ...(input.recurrenceEnd ? { recurrenceEnd: input.recurrenceEnd } : {}),
      status: input.status ?? POLL_STATUS.ACTIVE,
      ...(input.tags ? { tags: input.tags } : {}),
      ...(input.category ? { category: input.category } : {}),
      currentEdition,
    };
    if (audienceType === POLL_AUDIENCE.COMMUNITY) {
      await ctx.db.insert("polls", {
        ...base,
        ...(input.communityId ? { communityId: input.communityId } : {}),
        visibility: input.visibility ?? DEFAULT_VISIBILITY,
      });
    } else {
      await ctx.db.insert("polls", { ...base, shareToken: newShareToken() });
    }

    const poll = (await getPoll(ctx, pollId))!;
    const label = currentEditionLabel(poll);
    const bKey = ballotKey(pollId, label);
    await ensureEdition(ctx, pollId, label);

    const counts: Record<string, number> = {};
    const dimCounts: Record<string, Record<string, number>> = {};
    let total = 0;
    let registered = false;

    for (const vote of input.votes) {
      if (!poll.options.some((o) => o.id === vote.optionId)) continue;
      if (!registered) {
        await ensureRegistered(ctx, bKey, pollId, input.creatorLinkId);
        registered = true;
      }
      const attributable = vote.voterLinkId !== undefined && ballotMode === BALLOT_MODE.STANDARD;
      let dims: string[] | undefined;

      if (attributable) {
        const dup = await ctx.db
          .query("votes")
          .withIndex("by_ballot_voter", (q) => q.eq("ballotKey", bKey).eq("voter", vote.voterLinkId!))
          .unique();
        if (dup) continue; // one vote per voter per edition, like the real path
        const snapshot = await demographicsSnapshot(ctx, vote.voterLinkId!, poll);
        dims = toDims(snapshot);
        await insertVote(ctx, {
          ballotKey: bKey,
          voter: vote.voterLinkId!,
          optionId: vote.optionId,
          trust: VOTE_TRUST.VALID,
          linkId: vote.voterLinkId!,
          ...(snapshot ? { demographics: snapshot } : {}),
        });
        await insertVoteEvent(ctx, bKey, vote.optionId, 1, dims);
        await bumpUserStats(ctx, vote.voterLinkId!, { votesCast: 1 });
      } else {
        await insertVote(ctx, {
          ballotKey: bKey,
          voter: newGuestVoter(),
          optionId: vote.optionId,
          trust: VOTE_TRUST.VALID,
          ...(vote.guestName ? { guestName: vote.guestName } : {}),
        });
        await insertVoteEvent(ctx, bKey, vote.optionId, 1);
      }

      counts[vote.optionId] = (counts[vote.optionId] ?? 0) + 1;
      total++;
      for (const d of dims ?? []) {
        const per = (dimCounts[d] ??= {});
        per[vote.optionId] = (per[vote.optionId] ?? 0) + 1;
      }
    }

    if (total > 0) {
      await ctx.db.insert("editionResults", {
        ballotKey: bKey,
        counts,
        dimCounts,
        totalVotes: total,
        publishedAt: Date.now(),
      });
    }

    for (const c of input.comments ?? []) {
      await ctx.db.insert("comments", {
        commentId: newCommentId(),
        pollId,
        authorId: c.authorLinkId,
        text: c.text,
        status: COMMENT_STATUS.ACTIVE,
      });
    }

    await bumpUserStats(ctx, input.creatorLinkId, { pollsCreated: 1, totalVotesReceived: total });
    return { pollId, votes: total, comments: (input.comments ?? []).length };
  },
});

// ── Wipe (optional; only when you want a clean slate) ─────────────────────────

const SEED_TABLES = [
  "identities", "userPII", "consents",
  "users", "userStats", "userDemographics", "userSettings", "userModeration",
  "communities", "communityRoles", "communityBans", "communityPins", "subscriptions",
  "polls", "editions", "votes", "voteEvents", "editionResults", "tallyState",
  "tallyRegistry", "comments",
] as const;

/** Deletes every row from the seed-affected tables. Includes any account YOU created by
 *  logging in — you'd just sign in again afterwards. Pre-launch dev only. */
export const wipe = internalMutation({
  args: {},
  handler: async (ctx) => {
    assertSeedEnabled();
    const counts: Record<string, number> = {};
    for (const t of SEED_TABLES) {
      // t is a union of table-name literals; cast so the query overload resolves.
      const docs = await ctx.db.query(t as "users").collect();
      for (const d of docs) await ctx.db.delete(d._id);
      counts[t] = docs.length;
    }
    return counts;
  },
});

// ── Orchestrated run (the dev entry point) ────────────────────────────────────
// Replaces the old client-side seed/seed.mjs, which reached the mutations above over the
// public API (the reason they used to be public + destructive — a real exposure). The
// mutations are now internal, and this action drives the whole expansion server-side. It is
// only reachable via the admin-authed CLI/dashboard (`npx convex run seed:run`), never from
// a client. The seed data lives in ./seed_data/*.json (edit those to change the content).

// Typed views of the JSON config (resolveJsonModule widens literals to `string`, which the
// downstream validators reject — so we assert the precise shapes here, once).
interface UsersCfg {
  count: number;
  displayNames: string[];
  bios: string[];
  genders: string[];
  locations: string[];
  birthYearMin: number;
  birthYearMax: number;
  noBioFraction: number;
}
interface CommunityCfg {
  name: string;
  category?: string;
  description?: string;
  tags?: string[];
  visibility?: "public" | "protected" | "private";
  rules?: string;
}
interface CommsCfg {
  memberFractionMin: number;
  memberFractionMax: number;
  communities: CommunityCfg[];
}
interface PollCfg {
  community: string | null;
  question: string;
  type: "binary" | "multi";
  options: string[];
  ballotMode?: "standard" | "anonymous";
  recurrence?: "NONE" | "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY" | "MANUAL";
  timezone?: string;
  recurrenceStart?: string;
  recurrenceEnd?: string;
  status?: "ACTIVE" | "CLOSED";
  tags?: string[];
  votes: number;
  weights?: number[];
  comments?: number;
}
interface PollsCfg {
  polls: PollCfg[];
}
interface CommentsCfg {
  comments: string[];
}

const usersCfg = usersCfgRaw as unknown as UsersCfg;
const commsCfg = commsCfgRaw as unknown as CommsCfg;
const pollsCfg = pollsCfgRaw as unknown as PollsCfg;
const commentsCfg = commentsCfgRaw as unknown as CommentsCfg;

// Tiny RNG helpers (non-deterministic on purpose — this is throwaway data). Math.random is
// real in actions, so each run produces fresh variety (additive seeding stays varied).
const randInt = (min: number, max: number): number =>
  Math.floor(Math.random() * (max - min + 1)) + min;
const pick = <T,>(arr: ReadonlyArray<T>): T => arr[Math.floor(Math.random() * arr.length)];
const shuffle = <T,>(arr: ReadonlyArray<T>): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const weightedIndex = (weights: number[]): number => {
  const sum = weights.reduce((s, w) => s + w, 0);
  let r = Math.random() * sum;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return weights.length - 1;
};
const chunk = <T,>(arr: T[], n: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};
// "US-CA" (ISO-3166-2) → { country: "US", state: "US-CA" } for the demographics split (DESIGN-008).
const splitLocation = (loc: string) => ({ country: loc.split("-")[0], state: loc });

export const run = internalAction({
  args: { wipe: v.optional(v.boolean()) },
  handler: async (ctx, { wipe }) => {
    assertSeedEnabled();
    const runId = Date.now().toString(36);
    console.log(`→ Run id: ${runId}  ${wipe ? "(WIPE first)" : "(additive)"}`);

    if (wipe) {
      const counts = await ctx.runMutation(internal.seed.wipe, {});
      const total = Object.values(counts).reduce((s, n) => s + n, 0);
      console.log(`✗ Wiped ${total} rows across ${Object.keys(counts).length} tables.`);
    }

    // ── Users ──────────────────────────────────────────────────────────────────
    const names = shuffle(usersCfg.displayNames).slice(0, usersCfg.count);
    const userPayload = names.map((displayName, i) => {
      const consent = Math.random() < 0.85;
      const birthYear = randInt(usersCfg.birthYearMin, usersCfg.birthYearMax);
      const handle = displayName.replace(/[^a-z0-9]/gi, "").toLowerCase() || "user";
      return {
        subject: `seed-${runId}-${i}`,
        email: `${handle}.${runId}@seed.pollzens.test`,
        displayName,
        birthDate: `${birthYear}-06-15`,
        ...(Math.random() > usersCfg.noBioFraction ? { bio: pick(usersCfg.bios) } : {}),
        gender: pick(usersCfg.genders),
        ...splitLocation(pick(usersCfg.locations)),
        birthYear,
        demographicsPublic: true,
        demographicsConsent: consent,
      };
    });

    const users: Array<{ linkId: string; displayName: string }> = [];
    for (const batch of chunk(userPayload, 20)) {
      const res = await ctx.runMutation(internal.seed.seedUsers, { users: batch });
      for (const r of res) if (r.linkId) users.push({ linkId: r.linkId, displayName: r.displayName });
    }
    const allLinkIds = users.map((u) => u.linkId);
    console.log(`✓ Users: ${users.length}`);

    // ── Communities (each gets a random member subset) ───────────────────────────
    const commInput = commsCfg.communities.map((c) => {
      const frac =
        commsCfg.memberFractionMin +
        Math.random() * (commsCfg.memberFractionMax - commsCfg.memberFractionMin);
      const members = shuffle(allLinkIds).slice(0, Math.max(3, Math.round(allLinkIds.length * frac)));
      return { ...c, ownerLinkId: members[0], memberLinkIds: members };
    });
    const commRes = await ctx.runMutation(internal.seed.seedCommunities, { communities: commInput });
    const membersByName = new Map(commInput.map((c) => [c.name, c.memberLinkIds]));
    const idByName = new Map(commRes.map((c) => [c.name, c.communityId]));
    console.log(
      `✓ Communities: ${commRes.map((c) => `${c.name}${c.created ? "" : " (reused)"}`).join(", ")}`,
    );

    // ── Polls (+ votes + comments) ───────────────────────────────────────────────
    let pollCount = 0,
      voteCount = 0,
      commentCount = 0;
    for (const p of pollsCfg.polls) {
      const isLink = p.community === null || p.community === undefined;
      const options = p.options.map((label, i) => ({ id: `o${i + 1}`, label }));
      const weights = p.weights ?? options.map(() => 1);

      let creatorLinkId: string;
      let communityId: string | undefined;
      let voterPool: string[];
      if (isLink) {
        creatorLinkId = pick(allLinkIds);
        communityId = undefined;
        voterPool = allLinkIds;
      } else {
        const members = membersByName.get(p.community!) ?? allLinkIds;
        creatorLinkId = pick(members);
        communityId = idByName.get(p.community!);
        voterPool = members;
      }

      const anonymous = p.ballotMode === "anonymous";
      const votes: Array<{ voterLinkId?: string; optionId: string }> = [];
      if (anonymous) {
        for (let i = 0; i < p.votes; i++) {
          votes.push({ optionId: options[weightedIndex(weights)].id });
        }
      } else {
        // attributable: one vote per voter, so cap at the available pool
        const voters = shuffle(voterPool).slice(0, Math.min(p.votes, voterPool.length));
        for (const voterLinkId of voters) {
          votes.push({ voterLinkId, optionId: options[weightedIndex(weights)].id });
        }
      }

      const nComments = Math.min(p.comments ?? 0, commentsCfg.comments.length);
      const comments = shuffle(commentsCfg.comments)
        .slice(0, nComments)
        .map((text) => ({
          authorLinkId: pick(isLink ? allLinkIds : (membersByName.get(p.community!) ?? allLinkIds)),
          text,
        }));

      const res = await ctx.runMutation(internal.seed.seedPoll, {
        creatorLinkId,
        audienceType: isLink ? "LINK" : "COMMUNITY",
        ...(communityId ? { communityId } : {}),
        question: p.question,
        type: p.type,
        options,
        ballotMode: p.ballotMode ?? "standard",
        ...(p.recurrence ? { recurrence: p.recurrence } : {}),
        ...(p.timezone ? { timezone: p.timezone } : {}),
        ...(p.recurrenceStart ? { recurrenceStart: p.recurrenceStart } : {}),
        ...(p.recurrenceEnd ? { recurrenceEnd: p.recurrenceEnd } : {}),
        ...(p.status ? { status: p.status } : {}),
        ...(p.tags ? { tags: p.tags } : {}),
        votes,
        comments,
      });
      pollCount++;
      voteCount += res.votes;
      commentCount += res.comments;
    }

    console.log(`✓ Done: ${pollCount} polls, ${voteCount} votes, ${commentCount} comments.`);
    console.log("Live vote tallies finish publishing within ~5–10s (tally cron). Refresh the site.");
    return { users: users.length, polls: pollCount, votes: voteCount, comments: commentCount };
  },
});
