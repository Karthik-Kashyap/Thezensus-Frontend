// Polls-domain behavior: input validation (the old Zod schemas), visibility/authz
// rules (permissions.logic), edition-scoreboard assembly, and DTO mapping. DTO shapes
// mirror src/lib/types.ts Poll / PollListItem / EditionScoreboard — keep in sync.

import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import {
  POLL_AUDIENCE,
  POLL_TYPE,
  POLL_VISIBILITY,
  POLL_STATUS,
  POLL_MOD_STATUS,
  POLL_LIMITS,
  BINARY_OPTION_COUNT,
  EDITION_STATUS,
  COMMENT_COUNT_CAP,
  EDITION_HISTORY_MAX,
  HOME_CANDIDATE_PER_COMMUNITY,
  DISCOVER_CANDIDATE_SCAN,
  TRENDING_TAGS_MAX,
  RECURRENCE,
  INTERVAL_MINUTES_ALLOWED,
  ballotKey,
  type PollVisibility,
  type Recurrence,
} from "./constants/poll";
import {
  currentEditionLabel,
  windowState,
  isTimeBased,
  computeEditionLabel,
  nextEditionStart,
  type WindowState,
} from "./editions.logic";
import { badRequest } from "./errors";
import { isMember, isOwnerOrMod } from "./communities.model";
import { getProfile } from "./users.model";
import { getEdition, editionsByPoll, pollsByCommunity, pollsDiscoverable } from "./polls.model";
import { getResults, getVote } from "./votes.model";
import { getMedia } from "./media.model";
import { MEDIA_KIND, MEDIA_STATUS } from "./constants/media";
import { hotScore, VOTED_HOT_PENALTY } from "./ranking";

type Ctx = QueryCtx | MutationCtx;

// ── Validation (port of poll-service validation/polls.schema.ts) ────────────

export interface PollOptionInput {
  id: string;
  label: string;
  mediaId?: string;
}

export function validateQuestion(question: string): string {
  const q = question.trim();
  if (q.length < POLL_LIMITS.questionMin || q.length > POLL_LIMITS.questionMax) {
    throw badRequest(`Question must be ${POLL_LIMITS.questionMin}–${POLL_LIMITS.questionMax} characters`);
  }
  return q;
}

export function validateOptions(type: string, options: PollOptionInput[]): void {
  if (options.length < POLL_LIMITS.optionsMin || options.length > POLL_LIMITS.optionsMax) {
    throw badRequest(`Polls need ${POLL_LIMITS.optionsMin}–${POLL_LIMITS.optionsMax} options`);
  }
  if (type === POLL_TYPE.BINARY && options.length !== BINARY_OPTION_COUNT) {
    throw badRequest("Binary polls need exactly 2 options");
  }
  const ids = new Set<string>();
  for (const o of options) {
    if (o.id.length < 1 || o.id.length > POLL_LIMITS.optionIdMax) throw badRequest("Invalid option id");
    if (o.label.length < POLL_LIMITS.optionLabelMin || o.label.length > POLL_LIMITS.optionLabelMax) {
      throw badRequest(`Option labels must be ${POLL_LIMITS.optionLabelMin}–${POLL_LIMITS.optionLabelMax} characters`);
    }
    if (ids.has(o.id)) throw badRequest("Option ids must be unique");
    ids.add(o.id);
  }
}

export function validateTagsCategory(tags?: string[], category?: string): void {
  if (tags) {
    if (tags.length > POLL_LIMITS.tagsMax) throw badRequest(`At most ${POLL_LIMITS.tagsMax} tags`);
    if (tags.some((t) => t.length === 0 || t.length > POLL_LIMITS.tagMax)) throw badRequest("Invalid tag");
  }
  if (category !== undefined && category.length > POLL_LIMITS.categoryMax) throw badRequest("Invalid category");
}

/** An IANA zone id the runtime can actually resolve (bad ids throw inside Intl). */
export function validateTimezone(timezone: string): void {
  if (timezone.length > POLL_LIMITS.timezoneMax) throw badRequest("Invalid timezone");
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
  } catch {
    throw badRequest("Unknown timezone");
  }
}

/**
 * INTERVAL recurrence must carry a whitelisted slot length (INTERVAL_MINUTES_ALLOWED); every other
 * cadence must NOT carry one (silently ignoring a stray interval would hide create-form bugs).
 * Returns the value to persist (undefined for non-INTERVAL).
 */
export function validateRecurrenceInterval(
  recurrence: Recurrence,
  intervalMinutes: number | undefined,
): number | undefined {
  if (recurrence === RECURRENCE.INTERVAL) {
    if (intervalMinutes === undefined || !INTERVAL_MINUTES_ALLOWED.has(intervalMinutes)) {
      throw badRequest("Pick a valid interval length for an interval poll");
    }
    return intervalMinutes;
  }
  if (intervalMinutes !== undefined) {
    throw badRequest("intervalMinutes applies to interval polls only");
  }
  return undefined;
}

// ── Poll media (create-time validation + denormalization) ───────────────────

export interface ResolvedPollOption {
  id: string;
  label: string;
  mediaId?: string;
  mediaKey?: string;
}

export interface ResolvedPollMedia {
  questionMediaId?: string;
  questionMediaKey?: string;
  options: ResolvedPollOption[];
}

/**
 * Validate a poll's images and denormalize their serving keys at create time. Each referenced
 * media must be the creator's OWN (uploaded as draft poll media, ownerId = linkId), of the
 * matching poll kind, and READY — Phase A stamps READY synchronously in media.complete; the
 * Rekognition gate that holds media in PROCESSING until it clears lands in Phase B (DESIGN-007).
 * Storing the serving key on the poll keeps render one-hop (no media read on the feed/detail
 * path — exactly how avatarKey works). Mirrors the avatar-attach in users.updateMe.
 */
export async function resolvePollMedia(
  ctx: Ctx,
  creatorId: string,
  questionMediaId: string | undefined,
  options: PollOptionInput[],
): Promise<ResolvedPollMedia> {
  const servingKeyFor = async (mediaId: string, kind: string): Promise<string> => {
    const media = await getMedia(ctx, creatorId, mediaId);
    if (!media) throw badRequest("Poll media not found for this user");
    if (media.kind !== kind) throw badRequest("Wrong media kind for this slot");
    if (media.status !== MEDIA_STATUS.READY || !media.servingKey) {
      throw badRequest("Poll media is not ready");
    }
    return media.servingKey;
  };

  const resolved: ResolvedPollMedia = {
    options: await Promise.all(
      options.map(async (o) =>
        o.mediaId === undefined
          ? { id: o.id, label: o.label }
          : {
              id: o.id,
              label: o.label,
              mediaId: o.mediaId,
              mediaKey: await servingKeyFor(o.mediaId, MEDIA_KIND.POLL_OPTION),
            },
      ),
    ),
  };
  if (questionMediaId !== undefined) {
    resolved.questionMediaId = questionMediaId;
    resolved.questionMediaKey = await servingKeyFor(questionMediaId, MEDIA_KIND.POLL_QUESTION);
  }
  return resolved;
}

// ── Visibility / authz (port of permissions.logic.ts) ───────────────────────

/** Polls hidden from every read path: soft-deleted or platform-taken-down. */
export function isHidden(poll: Doc<"polls">): boolean {
  return poll.status === POLL_STATUS.DELETED || poll.modStatus === POLL_MOD_STATUS.TAKEN_DOWN;
}

/**
 * May this caller see the poll at all? LINK polls are token-gated (creator exempt);
 * COMMUNITY polls gate only PRIVATE on membership. Callers map `false` to notFound —
 * existence is never leaked.
 */
export async function canViewPoll(
  ctx: Ctx,
  poll: Doc<"polls">,
  linkId: string | null,
  token?: string,
): Promise<boolean> {
  if (isHidden(poll)) return false;
  if (poll.audienceType === POLL_AUDIENCE.LINK) {
    if (linkId && poll.creatorId === linkId) return true;
    return token !== undefined && token === poll.shareToken;
  }
  const visibility = poll.visibility ?? POLL_VISIBILITY.PUBLIC;
  if (visibility !== POLL_VISIBILITY.PRIVATE) return true; // public + protected: anyone views
  if (!linkId) return false;
  if (poll.creatorId === linkId) return true;
  if (!poll.communityId) return false;
  return (
    (await isMember(ctx, linkId, poll.communityId)) ||
    (await isOwnerOrMod(ctx, linkId, poll.communityId))
  );
}

/** May this caller edit/close/delete the poll? Creator, or owner/mod of its community. */
export async function canEditPoll(ctx: Ctx, poll: Doc<"polls">, linkId: string): Promise<boolean> {
  if (poll.creatorId === linkId) return true;
  if (poll.audienceType === POLL_AUDIENCE.COMMUNITY && poll.communityId) {
    return await isOwnerOrMod(ctx, linkId, poll.communityId);
  }
  return false;
}

// ── Edition scoreboard assembly ──────────────────────────────────────────────

export interface EditionView {
  label: string;
  windowState: WindowState;
  status: "OPEN" | "CLOSED";
  voteCount: number;
  optionCounts: Record<string, number>;
  /** Tally publish stamp — lets the client expire optimistic overlays exactly when
   *  the published counts include its own vote. Absent until the first publish. */
  publishedAt?: number;
  /** Epoch-ms instant the next edition opens (the "next poll in …" countdown target).
   *  Present only for time-based recurrences whose current edition is live and whose next
   *  period still falls within the recurrence window; absent for NONE/MANUAL and the final
   *  edition. Stable within an edition, so it never churns the reactive query. */
  nextEditionAt?: number;
}

/**
 * When a recurring poll's current edition is live, the instant its *next* edition opens —
 * so the UI can render a "next poll in …" countdown. Only for time-based cadences with the
 * current edition ACTIVE, and suppressed once the next period would land past recurrenceEnd
 * (no further edition exists to count down to).
 */
function nextEditionField(poll: Doc<"polls">, state: WindowState): { nextEditionAt?: number } {
  if (state !== "ACTIVE") return {};
  const at = nextEditionStart(poll.recurrence, poll.timezone, poll.intervalMinutes);
  if (at === undefined) return {};
  const nextLabel = computeEditionLabel(poll.recurrence, poll.timezone, poll.intervalMinutes, new Date(at));
  if (windowState(nextLabel, poll.recurrenceStart, poll.recurrenceEnd) === "ENDED") return {};
  return { nextEditionAt: at };
}

/**
 * A specific edition's scoreboard by label: counts from `editionResults` (the tally's
 * published doc — so any query returning this re-runs at most once per publish interval),
 * zeros synthesized when no votes yet, window state derived from the label. `isCurrent` gates
 * the `nextEditionAt` countdown (only the live edition counts down to a successor). Backs both
 * the live current-edition view and the read-only history viewer (DESIGN — past editions).
 */
export async function editionViewFor(
  ctx: Ctx,
  poll: Doc<"polls">,
  label: string,
  isCurrent: boolean,
): Promise<EditionView> {
  const [edition, results] = await Promise.all([
    getEdition(ctx, poll.pollId, label),
    getResults(ctx, ballotKey(poll.pollId, label)),
  ]);
  const optionCounts: Record<string, number> = {};
  for (const o of poll.options) optionCounts[o.id] = results?.counts[o.id] ?? 0;
  const state = windowState(label, poll.recurrenceStart, poll.recurrenceEnd);
  return {
    label,
    windowState: state,
    status: edition?.status ?? EDITION_STATUS.OPEN,
    voteCount: results?.totalVotes ?? 0,
    optionCounts,
    ...(results ? { publishedAt: results.publishedAt } : {}),
    ...(isCurrent ? nextEditionField(poll, state) : {}),
  };
}

/** The current edition's live scoreboard (compute-don't-roll label + the next-edition countdown). */
export async function editionView(ctx: Ctx, poll: Doc<"polls">): Promise<EditionView> {
  return editionViewFor(ctx, poll, currentEditionLabel(poll), true);
}

/** One edition by label, resolving whether it's the live (current) one — for the history viewer. */
export async function editionByLabel(
  ctx: Ctx,
  poll: Doc<"polls">,
  label: string,
): Promise<EditionView> {
  return editionViewFor(ctx, poll, label, label === currentEditionLabel(poll));
}

/**
 * A recurring poll's edition labels for the history picker, newest-first: the most recent
 * EDITION_HISTORY_MAX that ever opened (rows are created lazily on first vote), with the current
 * computed edition guaranteed at the front even if nobody has voted in it yet (so the default
 * selection always exists). Labels sort chronologically, so the index `desc` is already newest-first.
 */
export async function listEditionLabels(
  ctx: Ctx,
  poll: Doc<"polls">,
): Promise<{ current: string; labels: string[] }> {
  const current = currentEditionLabel(poll);
  const rows = await editionsByPoll(ctx, poll.pollId).take(EDITION_HISTORY_MAX);
  const labels = rows.map((r) => r.label);
  return { current, labels: labels.includes(current) ? labels : [current, ...labels] };
}

// ── DTO mapping (shapes mirror src/lib/types.ts) ────────────────────────────

function toSummaryFields(poll: Doc<"polls">) {
  return {
    pollId: poll.pollId,
    creatorId: poll.creatorId,
    audienceType: poll.audienceType,
    ...(poll.communityId !== undefined ? { communityId: poll.communityId } : {}),
    question: poll.question,
    ...(poll.questionMediaId !== undefined ? { questionMediaId: poll.questionMediaId } : {}),
    ...(poll.questionMediaKey !== undefined ? { questionMediaKey: poll.questionMediaKey } : {}),
    type: poll.type,
    // Carry the denormalized serving key + mediaId; the client resolves the URL (CDN public
    // base, or presigned GET of the viewer's own media) exactly like avatars — see useMediaUrl.
    options: poll.options.map((o) => ({
      id: o.id,
      label: o.label,
      ...(o.mediaId !== undefined ? { mediaId: o.mediaId } : {}),
      ...(o.mediaKey !== undefined ? { mediaKey: o.mediaKey } : {}),
    })),
    ...(poll.visibility !== undefined ? { visibility: poll.visibility } : {}),
    ballotMode: poll.ballotMode,
    recurrence: poll.recurrence,
    ...(poll.intervalMinutes !== undefined ? { intervalMinutes: poll.intervalMinutes } : {}),
    ...(poll.recurrenceStart !== undefined ? { recurrenceStart: poll.recurrenceStart } : {}),
    ...(poll.recurrenceEnd !== undefined ? { recurrenceEnd: poll.recurrenceEnd } : {}),
    status: poll.status,
    ...(poll.tags !== undefined ? { tags: poll.tags } : {}),
    ...(poll.category !== undefined ? { category: poll.category } : {}),
    ...(poll.shareCardShowResults !== undefined ? { shareCardShowResults: poll.shareCardShowResults } : {}),
    createdAt: new Date(poll._creationTime).toISOString(),
  };
}

/** Full detail-page DTO (`Poll`). shareToken only for the creator. */
export async function toPollDetail(
  ctx: Ctx,
  poll: Doc<"polls">,
  edition: EditionView,
  viewerLinkId: string | null,
): Promise<Record<string, unknown>> {
  const isCreator = viewerLinkId !== null && poll.creatorId === viewerLinkId;
  const [creatorProfile, creatorIsMember] = await Promise.all([
    getProfile(ctx, poll.creatorId),
    poll.audienceType === POLL_AUDIENCE.COMMUNITY && poll.communityId && isCreator
      ? isMember(ctx, viewerLinkId!, poll.communityId)
      : Promise.resolve(undefined),
  ]);
  return {
    ...toSummaryFields(poll),
    ...(creatorProfile?.handle ? { creatorHandle: creatorProfile.handle } : {}),
    requireLoginToVote: poll.requireLoginToVote,
    ...(poll.timezone !== undefined ? { timezone: poll.timezone } : {}),
    ...(creatorIsMember !== undefined ? { creatorIsMember } : {}),
    ...(isCreator && poll.shareToken !== undefined ? { shareToken: poll.shareToken } : {}),
    currentEdition: edition,
    // Frozen segments so the client can render the slice panel's chips + value pickers
    // (DESIGN-008). Just labels/options — the vote counts stay behind the paywalled getSlice.
    ...(poll.segmentSchema && poll.segmentSchema.length > 0
      ? { segmentSchema: poll.segmentSchema }
      : {}),
  };
}

/** Feed-card DTO (`PollListItem`): summary + scoreboard + capped comment count. */
export async function toFeedItem(
  ctx: Ctx,
  poll: Doc<"polls">,
): Promise<Record<string, unknown>> {
  const [edition, comments, creatorProfile] = await Promise.all([
    editionView(ctx, poll),
    ctx.db
      .query("comments")
      .withIndex("by_poll", (q) => q.eq("pollId", poll.pollId))
      .take(COMMENT_COUNT_CAP + 1),
    getProfile(ctx, poll.creatorId),
  ]);
  const visible = comments.filter((c) => c.status === "ACTIVE");
  return {
    ...toSummaryFields(poll),
    ...(creatorProfile?.handle ? { creatorHandle: creatorProfile.handle } : {}),
    currentEdition: edition,
    commentCount: Math.min(visible.length, COMMENT_COUNT_CAP),
    commentCountCapped: visible.length > COMMENT_COUNT_CAP,
  };
}

interface ScoredPoll {
  poll: Doc<"polls">;
  score: number;
}

/**
 * Hot-score a candidate poll set for a viewer, sorted hottest-first. Per candidate: read the
 * live vote count, and (when signed in) whether the viewer already voted this edition — voted
 * polls get a penalty so they sink below comparable unvoted ones but still sprinkle in when
 * much hotter. The scored set drives both the feed cards and the trending-tag facets, so the
 * vote-count read happens once.
 */
async function scoreCandidates(
  ctx: Ctx,
  candidates: Doc<"polls">[],
  viewer: string | null,
): Promise<ScoredPoll[]> {
  const now = Date.now();
  const scored = await Promise.all(
    candidates.map(async (poll) => {
      const bKey = ballotKey(poll.pollId, currentEditionLabel(poll));
      const [results, myVote] = await Promise.all([
        getResults(ctx, bKey),
        viewer ? getVote(ctx, bKey, viewer) : Promise.resolve(null),
      ]);
      const base = hotScore(results?.totalVotes ?? 0, poll._creationTime, now);
      return { poll, score: myVote ? base * VOTED_HOT_PENALTY : base };
    }),
  );
  scored.sort((a, b) => b.score - a.score);
  return scored;
}

/** Build full feed cards for the top `limit` of an already-sorted scored set. Cards are
 *  assembled only for the winners, so the per-card comment/edition reads stay bounded. */
async function buildFeedItems(
  ctx: Ctx,
  scored: ScoredPoll[],
  limit: number,
): Promise<Record<string, unknown>[]> {
  return await Promise.all(scored.slice(0, limit).map(({ poll }) => toFeedItem(ctx, poll)));
}

/** Hot-rank a candidate set and return the top `limit` as feed cards (home feed path). */
async function rankFeedItems(
  ctx: Ctx,
  candidates: Doc<"polls">[],
  viewer: string | null,
  limit: number,
): Promise<Record<string, unknown>[]> {
  return buildFeedItems(ctx, await scoreCandidates(ctx, candidates, viewer), limit);
}

/**
 * The Discover topic chips: each poll's tags accrue its hot score (ties broken by how many
 * polls carry the tag), so the chips track what's actually hot — and degrade gracefully to
 * "most-tagged" when nothing has votes yet (every score 0 ⇒ count decides). Top N returned.
 */
function trendingTags(scored: ScoredPoll[]): string[] {
  const acc = new Map<string, { weight: number; count: number }>();
  for (const { poll, score } of scored) {
    for (const raw of poll.tags ?? []) {
      const tag = raw.toLowerCase();
      const cur = acc.get(tag) ?? { weight: 0, count: 0 };
      cur.weight += score;
      cur.count += 1;
      acc.set(tag, cur);
    }
  }
  return [...acc.entries()]
    .sort((a, b) => b[1].weight - a[1].weight || b[1].count - a[1].count)
    .slice(0, TRENDING_TAGS_MAX)
    .map(([tag]) => tag);
}

/**
 * The signed-in user's home feed: hot-ranked across ALL their subscribed communities.
 * Candidate generation happens server-side so an older-but-busy poll can't be lost to a
 * per-community recency cap — we scan the newest HOME_CANDIDATE_PER_COMMUNITY of each
 * community (the hot score's age decay makes anything older a non-contender). canViewPoll
 * filters hidden/taken-down and gates PRIVATE on membership.
 */
export async function homeFeedItems(
  ctx: Ctx,
  communityIds: string[],
  viewer: string | null,
  limit: number,
): Promise<Record<string, unknown>[]> {
  const candidates: Doc<"polls">[] = [];
  for (const communityId of communityIds) {
    const polls = await pollsByCommunity(ctx, communityId).take(HOME_CANDIDATE_PER_COMMUNITY);
    for (const poll of polls) {
      if (await canViewPoll(ctx, poll, viewer)) candidates.push(poll);
    }
  }
  return rankFeedItems(ctx, candidates, viewer, limit);
}

/**
 * The global Discover feed (anonymous-allowed): hot-ranked so cold-start users land on the
 * liveliest, most-voted polls — an instant feel for active communities plus a poll to vote
 * on. Scans the newest DISCOVER_CANDIDATE_SCAN listable polls (the index pins COMMUNITY +
 * ACTIVE; we still drop takedowns + non-public visibility), then hot-ranks them.
 *
 * Returns the hot trending-tag chips alongside the cards. The chips are derived from the
 * FULL scanned pool (not the `tag`-filtered subset) so they stay stable as the user clicks
 * between topics. An optional `tag` narrows the cards to polls carrying it — still hot-ranked
 * within the same newest-N scan window (a tag whose polls are all older won't surface; that's
 * the documented trade-off, fixed later with a tag index if it matters).
 */
export async function discoverFeedItems(
  ctx: Ctx,
  viewer: string | null,
  limit: number,
  tag?: string,
): Promise<{ items: Record<string, unknown>[]; tags: string[] }> {
  const scanned = await pollsDiscoverable(ctx).take(DISCOVER_CANDIDATE_SCAN);
  const candidates = scanned.filter((poll) => !isHidden(poll) && publiclyListable(poll));
  const scored = await scoreCandidates(ctx, candidates, viewer);
  const tags = trendingTags(scored);
  const wanted = tag?.trim().toLowerCase();
  const matching = wanted
    ? scored.filter((s) => (s.poll.tags ?? []).some((t) => t.toLowerCase() === wanted))
    : scored;
  const items = await buildFeedItems(ctx, matching, limit);
  return { items, tags };
}

// ── Segment schema freeze (DESIGN-008 §A) ───────────────────────────────────

/** A poll's frozen segment schema entry — the immutable copy of a community segment
 *  taken at poll-create time. Drops `archived` (a frozen schema only carries live
 *  segments) but keeps the positional `pos`/option `i`s that a segKey decodes against. */
export type FrozenSegment = NonNullable<Doc<"polls">["segmentSchema"]>[number];

/**
 * Freeze a community's segments onto a new poll (DESIGN-008): copy the **non-archived**
 * segments into an immutable schema so later community-segment edits/retirements can never
 * re-interpret this poll's positional segKeys. Preserves `id`, `label`, `pos`, `options`
 * ({i,label}) and `version`; excludes retired segments. Returns `undefined` when the community
 * has no live segments so the create handler can omit `segmentSchema` entirely.
 */
export function freezeSegmentSchema(community: Doc<"communities">): FrozenSegment[] | undefined {
  const frozen = (community.segments ?? [])
    .filter((s) => !s.archived)
    .map((s) => ({
      id: s.id,
      label: s.label,
      pos: s.pos,
      options: s.options.map((o) => ({ i: o.i, label: o.label })),
      ...(s.version !== undefined ? { version: s.version } : {}),
    }));
  return frozen.length > 0 ? frozen : undefined;
}

/** True when `visibility` would let a non-member viewer see a community poll in a feed. */
export function publiclyListable(poll: Doc<"polls">): boolean {
  if (poll.audienceType !== POLL_AUDIENCE.COMMUNITY) return false; // LINK: never listed
  const v: PollVisibility = poll.visibility ?? POLL_VISIBILITY.PUBLIC;
  return v === POLL_VISIBILITY.PUBLIC || v === POLL_VISIBILITY.PROTECTED;
}

/** MANUAL/NONE polls store the authoritative label; time-based recompute (memo = display). */
export function initialEditionLabel(
  recurrence: Doc<"polls">["recurrence"],
  timezone?: string,
  intervalMinutes?: number,
): string {
  return currentEditionLabel({ recurrence, timezone, intervalMinutes, currentEdition: undefined });
}

export { isTimeBased };
