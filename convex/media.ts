// Media API — queries/mutations for the media registry. The S3-touching halves
// (presigned PUT/GET) live in mediaActions.ts ("use node" files may only export
// actions — the one place the one-file-per-domain rule bends).
//
// v1 lifecycle (no processing pipeline deployed): PENDING → (client PUTs to S3) →
// complete → READY with servingKey = stagingKey (original bytes served as-is). The
// future S3-event Lambda pipeline (resize/re-encode/variants) reports through the
// markProcessed httpAction stub in http.ts and takes over READY-stamping then.

import { v } from "convex/values";
import { mutation, query, internalQuery, internalMutation } from "./_generated/server";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import { requireActor } from "./lib/actor";
import { badRequest, notFound, forbidden } from "./lib/errors";
import {
  MEDIA_KIND,
  MEDIA_STATUS,
  MEDIA_PENDING_TTL_MS,
} from "./lib/constants/media";
import { getMedia } from "./lib/media.model";
import { getRole } from "./lib/communities.model";
import type { Doc } from "./_generated/dataModel";

export function toMediaRecord(media: Doc<"media">): Record<string, unknown> {
  return {
    mediaId: media.mediaId,
    ownerId: media.ownerId,
    kind: media.kind,
    status: media.status,
    contentType: media.contentType,
    ...(media.width !== undefined ? { width: media.width } : {}),
    ...(media.height !== undefined ? { height: media.height } : {}),
    ...(media.bytes !== undefined ? { bytes: media.bytes } : {}),
    createdAt: new Date(media._creationTime).toISOString(),
  };
}

/** May this caller manage media under `ownerId` for `kind`? (avatar = self;
 *  community_icon = owner/mod of that community). */
export async function assertMediaOwnership(
  ctx: QueryCtx | MutationCtx,
  linkId: string,
  kind: string,
  ownerId: string,
): Promise<void> {
  if (kind === MEDIA_KIND.AVATAR) {
    if (ownerId !== linkId) throw forbidden("Not your media");
    return;
  }
  if (kind === MEDIA_KIND.COMMUNITY_ICON) {
    if (!(await getRole(ctx, linkId, ownerId))) throw forbidden("Owner or moderator only");
    return;
  }
  // Poll media is uploaded as the creator's OWN draft media (ownerId = linkId) before the
  // poll exists; polls.create later validates it + denormalizes the serving key onto the poll.
  // Owner-by-pollId is unnecessary (the poll doc lists its own mediaIds; erasure cleans these
  // via the owner=linkId media walk). DESIGN-007 — diverges from the DB-TABLES "ownerId=pollId"
  // sketch, which predated the Convex poll doc carrying its mediaIds inline.
  if (kind === MEDIA_KIND.POLL_QUESTION || kind === MEDIA_KIND.POLL_OPTION) {
    if (ownerId !== linkId) throw forbidden("Not your media");
    return;
  }
  throw badRequest("Unsupported media kind");
}

/** Ownership pre-check for the initiate action (actions can't read the db directly). */
export const assertUpload = internalQuery({
  args: { linkId: v.string(), kind: v.string(), ownerId: v.string() },
  handler: async (ctx, { linkId, kind, ownerId }) => {
    await assertMediaOwnership(ctx, linkId, kind, ownerId);
    return null;
  },
});

/** Record insert for the initiate action. */
export const insertRecord = internalMutation({
  args: {
    mediaId: v.string(),
    ownerId: v.string(),
    kind: v.string(),
    contentType: v.string(),
    stagingKey: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("media", {
      ...args,
      status: MEDIA_STATUS.PENDING,
      pendingExpiresAt: Date.now() + MEDIA_PENDING_TTL_MS,
    });
    return null;
  },
});

/** Record lookup for the getUrl action (owner-gated there). */
export const recordByOwner = internalQuery({
  args: { ownerId: v.string(), mediaId: v.string() },
  handler: async (ctx, { ownerId, mediaId }) => {
    return await getMedia(ctx, ownerId, mediaId);
  },
});

/** Future-pipeline entry point (http.ts /media/processed): the Lambda's verdict. */
export const markProcessed = internalMutation({
  args: {
    ownerId: v.string(),
    mediaId: v.string(),
    servingKey: v.string(),
    contentType: v.optional(v.string()),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    bytes: v.optional(v.number()),
  },
  handler: async (ctx, { ownerId, mediaId, servingKey, contentType, width, height, bytes }) => {
    const media = await getMedia(ctx, ownerId, mediaId);
    if (!media || media.status === MEDIA_STATUS.PRESERVED) return null;
    await ctx.db.patch(media._id, {
      status: MEDIA_STATUS.READY,
      servingKey,
      ...(contentType !== undefined ? { contentType } : {}),
      ...(width !== undefined ? { width } : {}),
      ...(height !== undefined ? { height } : {}),
      ...(bytes !== undefined ? { bytes } : {}),
      pendingExpiresAt: undefined,
    });
    return null;
  },
});

/**
 * POST /media/:id/complete — the client finished its presigned PUT.
 *
 * Two regimes, switched by MEDIA_MODERATION_ENABLED (DESIGN-007):
 *  • enabled  → mark UPLOADED and hand off to the async scan. The S3-event Lambda
 *    (Rekognition) sets READY (+ serving-bucket servingKey) or REJECTED via
 *    /media/processed. NOT servable here — fail-closed: no servingKey until the gate clears.
 *  • disabled → Phase-A fallback: stamp READY now with servingKey = stagingKey (serve
 *    the original straight from staging).
 *
 * Tolerant by design: only a PENDING row advances. If the Lambda already moved it on
 * (it fires on the PUT, possibly before this call), this is an idempotent no-op — the
 * client's "done uploading" signal must never regress the pipeline's verdict.
 */
export const complete = mutation({
  args: { mediaId: v.string(), ownerId: v.string() },
  handler: async (ctx, { mediaId, ownerId }) => {
    const actor = await requireActor(ctx);
    const media = await getMedia(ctx, ownerId, mediaId);
    if (!media) throw notFound("Media not found");
    await assertMediaOwnership(ctx, actor.linkId, media.kind, ownerId);
    if (media.status !== MEDIA_STATUS.PENDING) return toMediaRecord(media); // already past PENDING

    if (process.env.MEDIA_MODERATION_ENABLED === "true") {
      // Keep pendingExpiresAt: a row stuck UPLOADED (Lambda never ran) is still reaped.
      await ctx.db.patch(media._id, { status: MEDIA_STATUS.UPLOADED });
    } else {
      await ctx.db.patch(media._id, {
        status: MEDIA_STATUS.READY,
        servingKey: media.stagingKey,
        pendingExpiresAt: undefined,
      });
    }
    return toMediaRecord((await ctx.db.get(media._id))!);
  },
});

/**
 * Owner-gated status read — the upload client polls this after `complete` to wait for the
 * moderation verdict (READY to attach, REJECTED = not allowed, FAILED = scanner error).
 */
export const status = query({
  args: { mediaId: v.string(), ownerId: v.string() },
  handler: async (ctx, { mediaId, ownerId }) => {
    const actor = await requireActor(ctx);
    const media = await getMedia(ctx, ownerId, mediaId);
    if (!media) return null;
    await assertMediaOwnership(ctx, actor.linkId, media.kind, ownerId);
    return toMediaRecord(media);
  },
});

/** Gate-A verdict: NSFW → REJECTED, bytes already discarded by the Lambda. */
export const markRejected = internalMutation({
  args: { ownerId: v.string(), mediaId: v.string() },
  handler: async (ctx, { ownerId, mediaId }) => {
    const media = await getMedia(ctx, ownerId, mediaId);
    if (!media || media.status === MEDIA_STATUS.PRESERVED) return null; // never override a legal hold
    await ctx.db.patch(media._id, {
      status: MEDIA_STATUS.REJECTED,
      servingKey: undefined,
      pendingExpiresAt: undefined,
    });
    return null;
  },
});

/** Scanner error/timeout → FAILED (fail-closed; the upload client surfaces a retry). */
export const markFailed = internalMutation({
  args: { ownerId: v.string(), mediaId: v.string() },
  handler: async (ctx, { ownerId, mediaId }) => {
    const media = await getMedia(ctx, ownerId, mediaId);
    if (!media || media.status === MEDIA_STATUS.PRESERVED || media.status === MEDIA_STATUS.READY) {
      return null;
    }
    await ctx.db.patch(media._id, { status: MEDIA_STATUS.FAILED });
    return null;
  },
});
