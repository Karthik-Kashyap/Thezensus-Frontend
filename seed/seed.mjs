// Pollzens dev seeder. Reads the JSON in ./data, expands it into personas + communities
// + polls + votes + comments, and loads it into the DEV Convex deployment by calling the
// dev-only mutations in convex/seed.ts.
//
//   Run from the `frontend/` folder:   node seed/seed.mjs
//   Clean slate first (optional):      node seed/seed.mjs --wipe
//
// Prereqs: `npx convex dev` running (so convex/seed.ts is pushed + codegen'd), and
// seeding enabled on dev:  npx convex env set ALLOW_SEED true

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, "data");
const readJson = (name) => JSON.parse(readFileSync(join(dataDir, name), "utf8"));

// ── Resolve the dev deployment URL ───────────────────────────────────────────
function convexUrl() {
  if (process.env.NEXT_PUBLIC_CONVEX_URL) return process.env.NEXT_PUBLIC_CONVEX_URL;
  const env = readFileSync(join(here, "..", ".env.local"), "utf8");
  const m = env.match(/^\s*NEXT_PUBLIC_CONVEX_URL\s*=\s*(.+)\s*$/m);
  if (!m) throw new Error("Could not find NEXT_PUBLIC_CONVEX_URL in frontend/.env.local");
  return m[1].trim().replace(/^["']|["']$/g, "");
}

// ── Tiny RNG helpers (non-deterministic on purpose — this is throwaway data) ──
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const weightedIndex = (weights) => {
  const sum = weights.reduce((s, w) => s + w, 0);
  let r = Math.random() * sum;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return weights.length - 1;
};
const chunk = (arr, n) => {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

async function main() {
  const wipe = process.argv.includes("--wipe");
  const client = new ConvexHttpClient(convexUrl());
  const runId = Date.now().toString(36);

  const usersCfg = readJson("users.json");
  const commsCfg = readJson("communities.json");
  const pollsCfg = readJson("polls.json");
  const commentPool = readJson("comments.json").comments;

  console.log(`→ Convex: ${convexUrl()}`);
  console.log(`→ Run id: ${runId}  ${wipe ? "(WIPE first)" : "(additive)"}`);

  if (wipe) {
    const counts = await client.mutation(api.seed.wipe, {});
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
      region: pick(usersCfg.regions),
      birthYear,
      demographicsPublic: true,
      demographicsConsent: consent,
    };
  });

  const users = [];
  for (const batch of chunk(userPayload, 20)) {
    const res = await client.mutation(api.seed.seedUsers, { users: batch });
    for (const r of res) if (r.linkId) users.push({ linkId: r.linkId, displayName: r.displayName });
  }
  const allLinkIds = users.map((u) => u.linkId);
  console.log(`✓ Users: ${users.length}`);

  // ── Communities (each gets a random member subset) ───────────────────────────
  const commInput = commsCfg.communities.map((c) => {
    const frac = commsCfg.memberFractionMin +
      Math.random() * (commsCfg.memberFractionMax - commsCfg.memberFractionMin);
    const members = shuffle(allLinkIds).slice(0, Math.max(3, Math.round(allLinkIds.length * frac)));
    return { ...c, ownerLinkId: members[0], memberLinkIds: members };
  });
  const commRes = await client.mutation(api.seed.seedCommunities, { communities: commInput });
  const membersByName = new Map(commInput.map((c) => [c.name, c.memberLinkIds]));
  const idByName = new Map(commRes.map((c) => [c.name, c.communityId]));
  console.log(`✓ Communities: ${commRes.map((c) => `${c.name}${c.created ? "" : " (reused)"}`).join(", ")}`);

  // ── Polls (+ votes + comments) ───────────────────────────────────────────────
  let pollCount = 0, voteCount = 0, commentCount = 0;
  for (const p of pollsCfg.polls) {
    const isLink = p.community === null || p.community === undefined;
    const options = p.options.map((label, i) => ({ id: `o${i + 1}`, label }));
    const weights = p.weights ?? options.map(() => 1);

    let creatorLinkId, communityId, voterPool;
    if (isLink) {
      creatorLinkId = pick(allLinkIds);
      communityId = undefined;
      voterPool = allLinkIds;
    } else {
      const members = membersByName.get(p.community) ?? allLinkIds;
      creatorLinkId = pick(members);
      communityId = idByName.get(p.community);
      voterPool = members;
    }

    const anonymous = p.ballotMode === "anonymous";
    const votes = [];
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

    const nComments = Math.min(p.comments ?? 0, commentPool.length);
    const comments = shuffle(commentPool).slice(0, nComments).map((text) => ({
      authorLinkId: pick(isLink ? allLinkIds : (membersByName.get(p.community) ?? allLinkIds)),
      text,
    }));

    const res = await client.mutation(api.seed.seedPoll, {
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
    const flags = [p.recurrence && p.recurrence !== "NONE" ? p.recurrence : null, p.status === "CLOSED" ? "CLOSED" : null]
      .filter(Boolean).join(" ");
    console.log(`  • ${p.question}  —  ${res.votes} votes, ${res.comments} comments${flags ? `  [${flags}]` : ""}`);
  }

  console.log(`\n✓ Done: ${pollCount} polls, ${voteCount} votes, ${commentCount} comments.`);
  console.log("Live vote tallies finish publishing within ~5–10s (tally cron). Refresh the site.");
}

main().catch((err) => {
  console.error("\n✗ Seed failed:", err.message || err);
  process.exit(1);
});
