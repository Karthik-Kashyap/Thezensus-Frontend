// Users API — the auth-service /users/* surface. Thin controllers: arg validation +
// actor resolution here; behavior in lib/users.logic + lib/consent.logic; data access in
// lib/*.model. DTO shapes mirror src/lib/types.ts (MeProfile / PublicProfile / DeletionResult).

import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { PROFILE_LIMITS, GENDER_OPTIONS, NOTIF_CHANNELS } from "./lib/constants/profile";
import { MEDIA_KIND, MEDIA_STATUS } from "./lib/constants/media";
import { optionalActor, requireActor, requireActorEvenIfBanned, isAdmin } from "./lib/actor";
import { badRequest, notFound, conflict } from "./lib/errors";
import { getUserAggregate, updateProfile, updateDemographics, updateSettings } from "./lib/users.model";
import { getPiiByLinkId, deletePii } from "./lib/pii.model";
import { getIdentity, deleteIdentity, PROVIDER } from "./lib/identities.model";
import { getMedia } from "./lib/media.model";
import { hasActiveHold } from "./lib/legalHolds.model";
import { cascadeDeleteByLinkId } from "./lib/cascade.model";
import { ageInYears, toMe, toPublic } from "./lib/users.logic";

/**
 * The signed-in user's own profile, or null when signed out — useSession() probes this
 * (replaces GET /users/me + its 401 contract). No ban gate: a suspended/banned user may
 * view their own account state (the gateway-allowlist carve-out); the UI renders the
 * suspended/appeal screen from `account.status`.
 */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const actor = await optionalActor(ctx);
    if (!actor) return null;
    const user = await getUserAggregate(ctx, actor.linkId);
    if (!user.profile) return null; // account erased but token still live
    const [pii, admin] = await Promise.all([
      getPiiByLinkId(ctx, actor.linkId),
      isAdmin(ctx, actor.linkId),
    ]);
    const age = pii ? ageInYears(pii.birthDate, new Date()) : undefined;
    return toMe(actor.linkId, user, pii?.email ?? "", Number.isNaN(age as number) ? undefined : age, admin);
  },
});

/** Another user's public profile, addressed by linkId (GET /users/:id). */
export const getPublic = query({
  args: { linkId: v.string() },
  handler: async (ctx, { linkId }) => {
    const user = await getUserAggregate(ctx, linkId);
    if (!user.profile) throw notFound("User not found");
    return toPublic(linkId, user);
  },
});

/** Partial profile edit across profile/demographics/settings docs (PATCH /users/me). */
export const updateMe = mutation({
  args: {
    bio: v.optional(v.string()),
    gender: v.optional(v.string()),
    region: v.optional(v.string()),
    demographicsPublic: v.optional(v.boolean()),
    notifPrefs: v.optional(v.array(v.string())),
    avatarMediaId: v.optional(v.string()),
  },
  handler: async (ctx, input) => {
    const actor = await requireActor(ctx);

    // Field rules (the old validation schemas) — limits live in constants/profile. The public
    // identity is the auto-generated handle: it isn't user-editable, so there's nothing to set here.
    if (input.bio !== undefined && input.bio.length > PROFILE_LIMITS.bioMax) {
      throw badRequest("Bio too long");
    }
    if (input.gender !== undefined && !(GENDER_OPTIONS as readonly string[]).includes(input.gender)) {
      throw badRequest("Invalid gender option");
    }
    if (input.region !== undefined && input.region.length > PROFILE_LIMITS.regionMax) {
      throw badRequest("Invalid region");
    }
    if (input.notifPrefs?.some((c) => !(NOTIF_CHANNELS as readonly string[]).includes(c))) {
      throw badRequest("Invalid notification channel");
    }

    // Avatar attach: must exist under this user, be READY, and be an avatar.
    let avatarKey: string | undefined;
    if (input.avatarMediaId !== undefined) {
      const media = await getMedia(ctx, actor.linkId, input.avatarMediaId);
      if (!media) throw badRequest("Avatar media not found for this user");
      if (media.kind !== MEDIA_KIND.AVATAR) throw badRequest("Media is not an avatar");
      if (media.status !== MEDIA_STATUS.READY || !media.servingKey) {
        throw badRequest("Avatar media is not ready");
      }
      avatarKey = media.servingKey;
    }

    await updateProfile(ctx, actor.linkId, {
      bio: input.bio,
      avatarMediaId: input.avatarMediaId,
      avatarKey,
    });
    await updateDemographics(ctx, actor.linkId, {
      gender: input.gender,
      region: input.region,
      demographicsPublic: input.demographicsPublic,
    });
    await updateSettings(ctx, actor.linkId, { notifPrefs: input.notifPrefs });

    // Return the fresh MeProfile (same contract as the old PATCH response).
    const user = await getUserAggregate(ctx, actor.linkId);
    const [pii, admin] = await Promise.all([
      getPiiByLinkId(ctx, actor.linkId),
      isAdmin(ctx, actor.linkId),
    ]);
    const age = pii ? ageInYears(pii.birthDate, new Date()) : undefined;
    return toMe(actor.linkId, user, pii?.email ?? "", Number.isNaN(age as number) ? undefined : age, admin);
  },
});

/**
 * DELETE /users/me — full erasure in ONE transaction (ADR-007):
 *   Phase A: sever the Identities row (login gone) and the UserPII vault row (raw PII +
 *   the userId↔linkId link gone) — the person is unidentifiable from here on.
 *   Phase B: cascade the linkId-keyed footprint (votes hard-deleted, comments redacted
 *   to "[deleted]", subscriptions/media/consents removed, user docs deleted). Published
 *   aggregates survive by construction — voteEvents carry no identity.
 * 409 if a legal hold is active on either the legal person or the pseudonym.
 */
export const deleteMe = mutation({
  args: {},
  handler: async (ctx) => {
    // Even-if-banned: a banned user keeps the right to erasure (the ban gate would
    // otherwise 403 them out of GDPR Art. 17).
    const actor = await requireActorEvenIfBanned(ctx);
    const pii = await getPiiByLinkId(ctx, actor.linkId);
    if (!pii) throw notFound("User not found");

    if (await hasActiveHold(ctx, [`USER#${pii.userId}`, `USER#${actor.linkId}`])) {
      throw conflict("Account is under a legal hold and cannot be deleted right now");
    }

    // Capture userId before the vault row dies — the consent walk needs it.
    const userId = pii.userId;

    const identity = await getIdentity(ctx, PROVIDER.GOOGLE, pii.googleSub);
    if (identity) await deleteIdentity(ctx, identity);
    await deletePii(ctx, pii);

    const deleted = await cascadeDeleteByLinkId(ctx, actor.linkId, userId);
    return { linkId: actor.linkId, deleted };
  },
});
