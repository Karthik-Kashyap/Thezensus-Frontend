// Deletion cascade Phase B (ADR-007 / DESIGN-005): the linkId-keyed footprint walk
// that runs inside deleteMe AFTER the Phase A sever. Everything here is one Convex
// mutation = one transaction — the cascade is all-or-nothing.
//
// Semantics per table (ported from auth-service cascade.model.ts):
//   votes          → HARD DELETE by the sparse by_linkId index (de-identifies the voter;
//                    voteEvents carry no identity, so published aggregates are untouched —
//                    "the user still counts in aggregates" by construction)
//   comments       → REDACT: authorId cleared; text kept; renders as "[deleted]"
//   subscriptions  → delete + decrement each community's best-effort subscriberCount
//   media          → delete rows EXCEPT status=PRESERVED (legal evidence outlives the
//                    account; S3 objects are the media domain's sweep concern)
//   consents       → delete (keyed by userId — capture it before the PII row dies)
//   user docs      → delete users/userStats/userDemographics/userSettings/userModeration
//
// Volume note: pre-launch footprints are tiny, so this collects inline. If a power
// user's footprint ever approaches mutation limits (~thousands of rows), split the
// vote walk into watermarked batches continued via ctx.scheduler.

import type { MutationCtx } from "../_generated/server";
import { MEDIA_STATUS } from "./constants/media";
import { getCommunity, bumpSubscriberCount } from "./communities.model";

export interface CascadeCounts {
  votes: number;
  subscriptions: number;
  media: number;
  consent: number;
  userItems: number;
}

export async function cascadeDeleteByLinkId(
  ctx: MutationCtx,
  linkId: string,
  userId: string,
): Promise<CascadeCounts> {
  // Votes — hard delete via the sparse index (guest votes have no linkId; untouched).
  const votes = await ctx.db
    .query("votes")
    .withIndex("by_linkId", (q) => q.eq("linkId", linkId))
    .collect();
  for (const vote of votes) await ctx.db.delete(vote._id);

  // Comments — redact authorship, keep the thread readable.
  const comments = await ctx.db
    .query("comments")
    .withIndex("by_author", (q) => q.eq("authorId", linkId))
    .collect();
  for (const comment of comments) await ctx.db.patch(comment._id, { authorId: undefined });

  // Subscriptions — delete + fix the approximate counters.
  const subs = await ctx.db
    .query("subscriptions")
    .withIndex("by_user_community", (q) => q.eq("linkId", linkId))
    .collect();
  for (const sub of subs) {
    await ctx.db.delete(sub._id);
    const community = await getCommunity(ctx, sub.communityId);
    if (community) await bumpSubscriberCount(ctx, community, -1);
  }

  // Media rows — preserved evidence stays. Prefix read of the pair index (rows come
  // back mediaId-ordered, which deletion doesn't care about).
  const media = await ctx.db
    .query("media")
    .withIndex("by_owner_media", (q) => q.eq("ownerId", linkId))
    .collect();
  const deletableMedia = media.filter((m) => m.status !== MEDIA_STATUS.PRESERVED);
  for (const m of deletableMedia) await ctx.db.delete(m._id);

  // Consent ledger — keyed by the legal person (userId), not the pseudonym.
  const consents = await ctx.db
    .query("consents")
    .withIndex("by_user_purpose", (q) => q.eq("userId", userId))
    .collect();
  for (const consent of consents) await ctx.db.delete(consent._id);

  // The user's own docs. The profile IS the linkId doc (linkId ≡ users._id);
  // the satellites are keyed by it.
  let userItems = 0;
  const profileId = ctx.db.normalizeId("users", linkId);
  if (profileId && (await ctx.db.get(profileId))) {
    await ctx.db.delete(profileId);
    userItems += 1;
  }
  for (const table of ["userStats", "userDemographics", "userSettings", "userModeration"] as const) {
    const doc = await ctx.db
      .query(table)
      .withIndex("by_linkId", (q) => q.eq("linkId", linkId as never))
      .unique();
    if (doc) {
      await ctx.db.delete(doc._id);
      userItems += 1;
    }
  }

  return {
    votes: votes.length,
    subscriptions: subs.length,
    media: deletableMedia.length,
    consent: consents.length,
    userItems,
  };
}
