// The full Pollzens schema — every DynamoDB table translated per DESIGN-006 §4.
// DDB item-collection tricks (SK discriminators, mirror items) are normalized into
// real tables; mirrors are replaced by two-way indexes. Entity ids stay app-generated
// prefixed ULIDs (lib/ids.ts) so URLs are independent of storage — with ONE deliberate
// exception (2026-06-11): the ADR-006 linkId pseudonym IS the `users` doc `_id`.
// Convex ids are opaque and non-temporal (the old bare-ULID linkId leaked signup time);
// every other table stores it as a plain string foreign key.
//
// Later-phase tables (polls/votes/moderation/media) are defined now so the schema is
// complete and stable; their functions arrive in their migration phase. Schema changes
// are cheap pre-launch — refine validators in the owning phase if needed.

import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// ── Shared enum validators ───────────────────────────────────────────────────

const accountStatus = v.union(v.literal("ACTIVE"), v.literal("SUSPENDED"), v.literal("BANNED"));
const modScope = v.union(v.literal("COMMUNITY"), v.literal("PLATFORM"));
const visibility = v.union(v.literal("public"), v.literal("protected"), v.literal("private"));
const ballotMode = v.union(v.literal("standard"), v.literal("anonymous"));
const voteTrust = v.union(v.literal("valid"), v.literal("suspect"), v.literal("invalid"));
const consentPurpose = v.union(
  v.literal("demographics"),
  v.literal("marketing_email"),
  v.literal("cookies_analytics"),
  v.literal("age_13plus"),
);
const consentSource = v.union(v.literal("signup"), v.literal("settings"), v.literal("reconsent"));
// Positional, append-only segment shape (DESIGN-008). A segment keeps its `pos` for
// life and option `i`s are never reordered/renumbered, so a positional segKey like
// "2.1.0.0.0" means the same thing forever. Retire via `archived`, never delete.
const segmentDef = v.object({
  id: v.string(),
  label: v.string(),
  pos: v.number(), // append-only position, 1-based
  options: v.array(v.object({ i: v.number(), label: v.string() })), // append-only option index + display label
  version: v.optional(v.number()),
  archived: v.optional(v.boolean()), // retire, never delete
});

export default defineSchema({
  // ── Identity & PII (ADR-006) ──────────────────────────────────────────────

  /**
   * 🔐 The PII vault — the ONLY table holding raw PII and the only place the
   * userId↔linkId link exists. Accessed exclusively through lib/pii.model.ts by
   * the auth domain (code boundary per decision D3; component isolation is a
   * planned fast-follow). `birthDate` is the COPPA source of truth (ADR-008).
   */
  userPII: defineTable({
    userId: v.string(), // the real-person ULID — never leaves the auth domain
    linkId: v.string(), // the pseudonym (= the users doc _id) — the vault holds the only userId↔linkId bridge
    email: v.string(),
    legalName: v.string(), // from the identity provider; never auto-published
    birthDate: v.string(), // full DOB, YYYY-MM-DD — vault only
    googleSub: v.string(),
  })
    .index("by_userId", ["userId"])
    .index("by_linkId", ["linkId"]),

  /** External login → userId. Uniqueness on (provider, subject) is enforced by the
   *  dedup-read + insert inside one mutation (OCC range conflict = conditional put).
   *  Single-provider for now: erasure finds the one row via pii.googleSub. If a second
   *  provider ever lands, erasure must enumerate a user's rows — add by_userId then. */
  identities: defineTable({
    provider: v.literal("GOOGLE"),
    subject: v.string(), // the Google `sub`
    userId: v.string(),
  }).index("by_provider_subject", ["provider", "subject"]),

  // ── Users (PII-free, keyed by linkId) ─────────────────────────────────────

  /** Public identity — an auto-generated cosmos handle (`Pulsar-4821`), NOT a real/Google name.
   *  The doc `_id` IS the linkId — the pseudonym every other table references. */
  users: defineTable({
    // The sole public identity (`Pulsar-4821`), assigned at signup, unique via by_handle.
    // Required: there is no real-name field on this table by design.
    handle: v.string(),
    bio: v.optional(v.string()),
    avatarMediaId: v.optional(v.string()),
    avatarKey: v.optional(v.string()), // denormalized READY serving key, one-hop render
    tier: v.optional(v.union(v.literal("free"), v.literal("pro"))), // absent ⇒ free; the slicing paywall lever (DESIGN-008)
  }).index("by_handle", ["handle"]),

  /** Public counters. Separate doc so stat bumps never OCC-contend with profile edits. */
  userStats: defineTable({
    linkId: v.string(),
    pollsCreated: v.number(),
    totalVotesReceived: v.number(),
    votesCast: v.number(),
  }).index("by_linkId", ["linkId"]),

  /**
   * Consent-gated analytics demographics on the pseudonymous side. `birthYear` only
   * (full DOB stays in the vault); `demographicsConsent` is the denormalized mirror of
   * the Consent ledger that the vote hot path checks (never a vault read per vote).
   */
  userDemographics: defineTable({
    linkId: v.string(),
    gender: v.optional(v.string()),
    // Geo demographics (DESIGN-008 region split): two flat marginals. `country` = ISO-3166-1
    // alpha-2 ("US"); `state` = ISO-3166-2 ("US-CA"). Both fold to separate `dimCounts` keys.
    country: v.optional(v.string()),
    state: v.optional(v.string()),
    region: v.optional(v.string()), // DEPRECATED — backfilled to country/state; drop after migration (RUNBOOK)
    birthYear: v.optional(v.number()),
    demographicsPublic: v.boolean(),
    demographicsConsent: v.boolean(),
  }).index("by_linkId", ["linkId"]),

  /** Server-only prefs; never shown to other users (email lives in the vault). */
  userSettings: defineTable({
    linkId: v.string(),
    notifPrefs: v.array(v.string()),
  }).index("by_linkId", ["linkId"]),

  /**
   * Platform enforcement + reporter reputation + admin grant for one user (DDB
   * MOD_STATUS + MOD_REP + ADMIN items merged — all low-rate, admin-written).
   * Absent doc ⇒ ACTIVE, no rep, not admin. Point-read by requireActor (the ban
   * gate that replaced the gateway + its 30s cache).
   */
  userModeration: defineTable({
    linkId: v.string(),
    accountStatus: accountStatus,
    scope: v.optional(modScope),
    reason: v.optional(v.string()),
    by: v.optional(v.string()), // admin linkId
    at: v.optional(v.string()), // ISO-8601
    until: v.optional(v.string()), // set for temporary SUSPENDED
    relatedReportId: v.optional(v.string()),
    modRep: v.optional(
      v.object({
        reportsMade: v.number(),
        reportsUpheld: v.number(),
        reportsDismissed: v.number(),
        strikes: v.number(),
      }),
    ),
    admin: v.optional(
      v.object({
        active: v.boolean(),
        grantedAt: v.string(),
        grantedBy: v.optional(v.string()),
        note: v.optional(v.string()),
      }),
    ),
  }).index("by_linkId", ["linkId"]),

  /** Append-only consent ledger (ADR-009), keyed by userId (the legal person).
   *  Current state per purpose = latest event (index order + _creationTime). */
  consents: defineTable({
    userId: v.string(),
    purpose: consentPurpose,
    granted: v.boolean(),
    policyVersion: v.string(),
    source: consentSource,
  }).index("by_user_purpose", ["userId", "purpose"]),

  // ── Communities (Phase 3) ─────────────────────────────────────────────────

  communities: defineTable({
    communityId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    iconMediaId: v.optional(v.string()),
    iconKey: v.optional(v.string()),
    visibility: visibility,
    subscriberCount: v.number(), // best-effort, as in DDB
    tags: v.optional(v.array(v.string())),
    category: v.optional(v.string()),
    rules: v.optional(v.string()),
    segments: v.optional(v.array(segmentDef)),
    createdBy: v.string(), // linkId
  }).index("by_communityId", ["communityId"]),

  /** Replaces both DDB Communities.ROLE# and the Users.COMMUNITY_ROLE# mirror.
   *  No by_user ["linkId"] index: nothing reads roles by user today. Add it when a
   *  "communities I moderate" view ships, or if the erasure cascade starts cleaning an
   *  erased user's role rows (cascade.model.ts currently leaves them in place). */
  communityRoles: defineTable({
    communityId: v.string(),
    linkId: v.string(),
    role: v.union(v.literal("OWNER"), v.literal("MODERATOR")),
    grantedBy: v.optional(v.string()),
  })
    // by_community is technically a prefix of by_community_user, but prefix reads come
    // back linkId-ordered — kept so role listings stay chronological (grant order).
    .index("by_community", ["communityId"])
    .index("by_community_user", ["communityId", "linkId"]),

  communityBans: defineTable({
    communityId: v.string(),
    linkId: v.string(),
    reason: v.optional(v.string()),
    bannedBy: v.string(),
  })
    .index("by_community", ["communityId"])
    .index("by_community_user", ["communityId", "linkId"]),

  communityPins: defineTable({
    communityId: v.string(),
    pollId: v.string(),
    pinnedBy: v.string(),
  })
    .index("by_community", ["communityId"])
    .index("by_community_poll", ["communityId", "pollId"]),

  subscriptions: defineTable({
    linkId: v.string(),
    communityId: v.string(),
    segments: v.optional(v.record(v.string(), v.string())), // segment id → answer
  })
    // Indexed one-way (user → communities) on purpose. A members list, community
    // deletion, or per-community segment analytics would walk the other way over
    // potentially millions of rows — add by_community ["communityId"] with whichever
    // of those ships first.
    .index("by_user_community", ["linkId", "communityId"]),

  // ── Polls & editions (Phase 2) ────────────────────────────────────────────

  polls: defineTable({
    pollId: v.string(),
    creatorId: v.string(), // linkId
    audienceType: v.union(v.literal("COMMUNITY"), v.literal("LINK")),
    communityId: v.optional(v.string()),
    question: v.string(),
    questionMediaId: v.optional(v.string()),
    questionMediaKey: v.optional(v.string()), // denormalized READY serving key, one-hop render (like avatarKey)
    type: v.union(v.literal("binary"), v.literal("multi")),
    options: v.array(
      v.object({
        id: v.string(),
        label: v.string(),
        mediaId: v.optional(v.string()),
        mediaKey: v.optional(v.string()), // denormalized READY serving key, one-hop render
      }),
    ),
    visibility: v.optional(visibility),
    ballotMode: ballotMode,
    requireLoginToVote: v.boolean(),
    recurrence: v.union(
      v.literal("NONE"),
      v.literal("DAILY"),
      v.literal("WEEKLY"),
      v.literal("MONTHLY"),
      v.literal("YEARLY"),
      v.literal("INTERVAL"), // fixed sub-daily / N-hour cadence; period length = intervalMinutes
      v.literal("MANUAL"),
    ),
    /** Slot length in minutes for INTERVAL recurrence (one of INTERVAL_MINUTES_ALLOWED); absent
     *  for every other cadence. Editions snap to clean clock marks anchored to local midnight. */
    intervalMinutes: v.optional(v.number()),
    timezone: v.optional(v.string()),
    recurrenceStart: v.optional(v.string()),
    recurrenceEnd: v.optional(v.string()),
    shareToken: v.optional(v.string()), // LINK polls; CSPRNG secret
    status: v.union(v.literal("ACTIVE"), v.literal("CLOSED"), v.literal("DELETED")),
    tags: v.optional(v.array(v.string())),
    category: v.optional(v.string()),
    /** Creator's choice: reveal the live vote breakdown on the social share card (OG image).
     *  Absent ⇒ reveal (the default); false ⇒ the card stays question-only. Display-only —
     *  never gates the poll page itself. */
    shareCardShowResults: v.optional(v.boolean()),
    /** Frozen copy of the community's segments at poll-create time (DESIGN-008). Immune to
     *  later community-segment edits — it's what turns a positional segKey back into labels. */
    segmentSchema: v.optional(v.array(segmentDef)),
    currentEdition: v.optional(v.string()), // memoized label — cache, not source of truth
    modStatus: v.optional(v.string()), // OK | TAKEN_DOWN (platform takedown)
    takedownReportId: v.optional(v.string()),
  })
    .index("by_pollId", ["pollId"])
    .index("by_community", ["communityId"])
    .index("by_creator", ["creatorId"])
    // Discover reads exactly the listable range (COMMUNITY + ACTIVE, newest-first)
    // instead of post-filtering a whole-table walk — and unlisted LINK-poll inserts no
    // longer invalidate every discover subscription (they fall outside the read range).
    .index("by_audience_status", ["audienceType", "status"]),

  /** Per-edition write gate. NO counters here — counts live in editionResults,
   *  produced by the single-writer tally (REVIEW-002 design rule #1). */
  editions: defineTable({
    pollId: v.string(),
    label: v.string(), // compute-don't-roll (SCRATCH-007)
    status: v.union(v.literal("OPEN"), v.literal("CLOSED")),
  }).index("by_poll_label", ["pollId", "label"]),

  // ── Votes (Phase 2 — the spike-v2 design, DESIGN-006 §5) ──────────────────

  /**
   * The ballot box: current state, one row per voter per edition. Insert/patch of
   * voter-owned rows ONLY — zero shared documents in the vote path. `linkId` is set
   * for attributable votes (sparse; deletion enumerates it); guests get voter =
   * "GUEST#<random>" and no linkId. Demographic snapshot only with consent (ADR-007).
   */
  votes: defineTable({
    ballotKey: v.string(), // `${pollId}#${editionLabel}`
    voter: v.string(), // linkId | GUEST#<random>
    optionId: v.string(),
    votedAt: v.number(),
    version: v.number(), // bumped on vote change
    trust: voteTrust,
    linkId: v.optional(v.string()),
    guestName: v.optional(v.string()), // display label for LINK-poll guests

    demographics: v.optional(
      v.object({
        gender: v.optional(v.string()),
        ageAtVote: v.optional(v.number()),
        country: v.optional(v.string()), // ISO-3166-1 alpha-2, e.g. "US" (DESIGN-008 region split)
        state: v.optional(v.string()), // ISO-3166-2, e.g. "US-CA"
        region: v.optional(v.string()), // DEPRECATED — historical snapshots only; drop after migration
        segments: v.optional(v.record(v.string(), v.string())),
      }),
    ),
  })
    // Two indexes ONLY — this is the hottest-write table (every insert maintains every
    // index) and it's headed for millions of rows. Deliberately no by_ballot
    // ["ballotKey"]: nothing lists votes per ballot (counts flow voteEvents →
    // editionResults). If a per-ballot read ships (LINK-poll guest scoreboard via
    // guestName, recounts, trust re-marking), the by_ballot_voter prefix already
    // enumerates a ballot voter-ordered; re-add by_ballot only if that read must be
    // time-ordered.
    .index("by_ballot_voter", ["ballotKey", "voter"])
    .index("by_linkId", ["linkId"]),

  /**
   * Append-only tally feed: +1/−1 deltas, paged by the single-writer tally cron.
   * Carries NO voter identity by design — aggregates survive account erasure by
   * construction (ADR-007 "still counts in aggregates"). Dims are flattened
   * "dimension#value" keys (e.g. "gender#female", "age#29", "seg:<id>#<answer>").
   * Never pruned today; a future drained-events sweep can page by_ballot +
   * _creationTime below the tally watermark — no extra index needed for it.
   */
  voteEvents: defineTable({
    ballotKey: v.string(),
    optionId: v.string(),
    delta: v.number(), // +1 cast / −1 the old option on change
    dims: v.optional(v.array(v.string())),
    segKey: v.optional(v.string()), // positional segment key, e.g. "2.1.0.0.0"; identity-free (option indices only)
  }).index("by_ballot", ["ballotKey"]),

  /** What every viewer subscribes to — one push per publish interval, regardless of
   *  vote volume (REVIEW-002 design rule #2). Replaces DDB EDITION# counters + Tallies. */
  editionResults: defineTable({
    ballotKey: v.string(),
    counts: v.record(v.string(), v.number()), // optionId → count
    dimCounts: v.optional(v.record(v.string(), v.record(v.string(), v.number()))), // "dim#value" → optionId → count
    crosstab: v.optional(v.record(v.string(), v.record(v.string(), v.number()))), // segKey → optionId → count (the combinable joint table)
    totalVotes: v.number(),
    publishedAt: v.number(),
  }).index("by_ballot", ["ballotKey"]),

  /**
   * The tally's persisted position + running sums. Written ONLY by the single-writer
   * tally (never read in the vote path — keeps votes contention-free). `watermark` is a
   * `_creationTime` bound, NOT a persisted `.paginate` cursor — end-cursors go stale
   * after a full drain and silently miss later inserts (gate-run finding 6, REVIEW-002).
   */
  tallyState: defineTable({
    ballotKey: v.string(),
    watermark: v.number(), // last folded voteEvents._creationTime; 0 = from the beginning
    counts: v.record(v.string(), v.number()),
    dimCounts: v.optional(v.record(v.string(), v.record(v.string(), v.number()))),
    crosstab: v.optional(v.record(v.string(), v.record(v.string(), v.number()))), // segKey → optionId → count (running sums)
    totalVotes: v.number(),
  }).index("by_ballot", ["ballotKey"]),

  /**
   * The tally's dirty set (DESIGN-009). One row per ballotKey, inserted by the first vote
   * on an edition; later votes read it but only the clean→dirty edge rewrites it (so the
   * vote path stays contention-free). A vote sets `dirtySince`; the drain folds the dirty
   * ballots of its shard and clears the flag — removing the row when the edition is no
   * longer current and fully drained. Both `shard` and `dirtySince` are always present —
   * set on every insert (vote path + seed).
   */
  tallyRegistry: defineTable({
    ballotKey: v.string(),
    pollId: v.string(),
    // The poll's creator, denormalized here so the drain can roll votes into the creator's
    // `userStats.totalVotesReceived` (DESIGN-011) without a per-publish poll read. Immutable
    // (a poll never changes creator), so the copy can't go stale. Set on every insert
    // (vote path + seed); backfilled onto pre-existing rows before this was made required.
    creatorId: v.string(),
    shard: v.number(), // = shardFor(ballotKey); assigned once at registration
    dirtySince: v.number(), // 0 = clean (folded & current); >0 = ms ts of the first vote since the last drain
  })
    .index("by_ballot", ["ballotKey"]) // vote-path point read + clear
    // The drain claims one shard's dirty ballots oldest-first (FIFO): clean rows sit at
    // dirtySince=0, so `eq(shard).gt(dirtySince, 0)` reads EXACTLY the dirty slice — never
    // a whole-table scan. Every row lives in this index for life.
    .index("by_shard_dirty", ["shard", "dirtySince"]),

  /**
   * One row per shard (W rows total). Coalesces drain SCHEDULING so at most one drain is
   * ever queued per shard. Touched only on the clean→dirty edge (arm) and by the drain's
   * rearm/disarm — never per vote. `lastArmedAt` is the drain chain's proof-of-life for the
   * safety sweep (a stale flag ⇒ the drain action died ⇒ re-arm). DESIGN-009 §4b.1.
   */
  tallyControl: defineTable({
    shard: v.number(),
    drainScheduled: v.boolean(), // true while a drain is queued/running for this shard
    lastArmedAt: v.optional(v.number()),
  }).index("by_shard", ["shard"]),

  // ── Comments (Phase 3) ────────────────────────────────────────────────────

  comments: defineTable({
    commentId: v.string(),
    pollId: v.string(),
    authorId: v.optional(v.string()), // linkId; cleared to "[deleted]" semantics by erasure
    // Denormalized author handle — the byline shown to users. Safe to copy because handles are
    // immutable (assigned once, never editable), so it can't go stale. Cleared on erasure
    // alongside authorId. Optional: absent on erased authors + pre-backfill rows.
    authorHandle: v.optional(v.string()),
    text: v.string(),
    status: v.union(v.literal("ACTIVE"), v.literal("REMOVED")),
    modStatus: v.optional(v.string()),
    editedAt: v.optional(v.string()),
    removedBy: v.optional(v.string()), // linkId of author/creator/mod who soft-deleted
    removedAt: v.optional(v.string()),
  })
    .index("by_commentId", ["commentId"])
    // Public thread + feed count JS-filter REMOVED/TAKEN_DOWN rows off by_poll pages.
    // If removed volume ever gets heavy at scale, add ["pollId", "status"] so those
    // reads touch only ACTIVE rows (also fixes the comment-count cap window
    // undercounting when removed rows crowd the newest COMMENT_COUNT_CAP+1).
    .index("by_poll", ["pollId"])
    .index("by_author", ["authorId"]),

  // ── Media registry (Phase 5; binaries stay in S3) ─────────────────────────

  media: defineTable({
    mediaId: v.string(),
    ownerId: v.string(), // linkId | communityId | pollId
    kind: v.string(), // avatar | community_icon | poll_question | poll_option
    status: v.string(), // PENDING…READY|FAILED|REJECTED|PRESERVED
    contentType: v.string(),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    bytes: v.optional(v.number()),
    stagingKey: v.string(),
    servingKey: v.optional(v.string()),
    /** Sweep-cron deadline for abandoned uploads (replaces DDB TTL; cleared on READY). */
    pendingExpiresAt: v.optional(v.number()),
    preservedReportId: v.optional(v.string()),
  })
    // Every flow is owner-scoped — even the pipeline callback (/media/processed)
    // carries ownerId — so the pair index serves both point reads and whole-owner
    // walks (the erasure cascade reads its prefix). Add by_mediaId ["mediaId"] only if
    // some flow ever holds a bare mediaId with no owner in hand.
    .index("by_owner_media", ["ownerId", "mediaId"])
    .index("by_pending_expiry", ["pendingExpiresAt"]),

  // ── Moderation (Phase 4) ──────────────────────────────────────────────────

  reports: defineTable({
    reportId: v.string(),
    category: v.string(), // REPORT_CATEGORY
    status: v.string(), // OPEN | UNDER_REVIEW | RESOLVED
    resolution: v.optional(v.string()),
    scope: modScope,
    communityId: v.optional(v.string()),
    targetType: v.string(), // POLL | COMMENT | USER | COMMUNITY
    targetId: v.string(),
    targetKey: v.string(), // `${targetType}#${targetId}`
    reporterId: v.string(),
    reason: v.optional(v.string()),
    resolvedAt: v.optional(v.string()),
    resolvedBy: v.optional(v.string()),
    relatedActionId: v.optional(v.string()),
    /** Sparse queue keys — set while OPEN, cleared on resolve (DDB sparse-GSI pattern). */
    queueState: v.optional(v.string()),
    queueCat: v.optional(v.string()),
  })
    .index("by_reportId", ["reportId"])
    // by_queue + by_queue_cat could fold into one ["queueState", "category"] index
    // (prefix = whole open queue, + category = filtered) and retire the derived
    // queueCat field — deferred because queueCat is in the Report DTO the frontend
    // reads (DDB-era wire contract).
    .index("by_queue", ["queueState"])
    .index("by_queue_cat", ["queueCat"])
    .index("by_target", ["targetKey"]),

  /** Preservation override: an ACTIVE hold blocks deletion + retention sweeps. */
  legalHolds: defineTable({
    subjectKey: v.string(), // `${subjectType}#${subjectId}`
    subjectType: v.string(),
    subjectId: v.string(),
    reason: v.string(), // HOLD_REASON
    caseRef: v.optional(v.string()),
    status: v.string(), // ACTIVE | RELEASED | EXPIRED
    openedBy: v.string(),
    releasedAt: v.optional(v.string()),
    expiresAt: v.optional(v.string()),
  }).index("by_subject", ["subjectKey"]),

  /** Append-only audit log of every moderation action. */
  modActions: defineTable({
    targetKey: v.string(),
    actionId: v.string(),
    targetType: v.string(),
    targetId: v.string(),
    action: v.string(), // MOD_ACTION verb
    actorId: v.string(), // admin linkId
    reason: v.optional(v.string()),
    relatedReportId: v.optional(v.string()),
    before: v.optional(v.any()),
    after: v.optional(v.any()),
  })
    // Audit reads are per-target only. An admin-accountability view ("everything
    // admin X did") would need by_actor ["actorId"] — add it with that feature.
    .index("by_target", ["targetKey"]),

  // ── Deferred (schema-only, build later — DB-TABLES §FraudSignals/§Notifications) ──

  fraudSignals: defineTable({
    voterKey: v.string(), // linkId | GUEST#…
    kind: v.string(),
    valueHash: v.string(), // hashed signals only, never raw IPs
    expiresAt: v.number(), // 90d sweep
  })
    .index("by_voter", ["voterKey"])
    .index("by_expiry", ["expiresAt"]),

  notifications: defineTable({
    linkId: v.string(),
    type: v.string(),
    actorId: v.optional(v.string()),
    targetKey: v.optional(v.string()),
    read: v.boolean(),
    expiresAt: v.number(), // 90d sweep
  }).index("by_user", ["linkId"]),
});
