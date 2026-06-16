"use node";

// Media S3 actions — the presigning halves of the media domain ("use node" files may
// only export actions; the registry queries/mutations live in media.ts).
//
// Deployment env vars (npx convex env set …):
//   AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY  — an IAM user scoped to the
//     staging bucket (Put/Get on staging/*)
//   MEDIA_STAGING_BUCKET — uploads land here under staging/{ownerId}/{mediaId}

import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { Doc } from "./_generated/dataModel";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ConvexError } from "convex/values";
import { newMediaId } from "./lib/ids";
import {
  SUPPORTED_UPLOAD_KINDS,
  MEDIA_CONTENT_TYPES,
  MEDIA_KIND,
  MEDIA_STATUS,
  UPLOAD_URL_EXPIRES_SECONDS,
  GET_URL_EXPIRES_SECONDS,
  stagingKey as buildStagingKey,
} from "./lib/constants/media";

function s3(): { client: S3Client; bucket: string } {
  const bucket = process.env.MEDIA_STAGING_BUCKET;
  if (!bucket) {
    throw new ConvexError({ code: 500, message: "Media storage is not configured (MEDIA_STAGING_BUCKET)" });
  }
  return { client: new S3Client({}), bucket }; // region/creds from AWS_* env vars
}

function requireSubject(identity: { subject: string } | null): string {
  if (!identity) throw new ConvexError({ code: 401, message: "Not authenticated" });
  return identity.subject;
}

/** POST /media — validate, register a PENDING record, hand back a presigned PUT. */
export const initiate = action({
  args: {
    kind: v.string(),
    contentType: v.string(),
    communityId: v.optional(v.string()),
  },
  handler: async (ctx, { kind, contentType, communityId }) => {
    const linkId = requireSubject(await ctx.auth.getUserIdentity());

    if (!(SUPPORTED_UPLOAD_KINDS as readonly string[]).includes(kind)) {
      throw new ConvexError({ code: 400, message: "Unsupported media kind" });
    }
    if (!(MEDIA_CONTENT_TYPES as readonly string[]).includes(contentType)) {
      throw new ConvexError({ code: 400, message: "Unsupported content type" });
    }
    if (kind === MEDIA_KIND.COMMUNITY_ICON && !communityId) {
      throw new ConvexError({ code: 400, message: "communityId required for community icons" });
    }
    const ownerId = kind === MEDIA_KIND.COMMUNITY_ICON ? communityId! : linkId;
    await ctx.runQuery(internal.media.assertUpload, { linkId, kind, ownerId });

    const mediaId = newMediaId();
    const stagingKey = buildStagingKey(ownerId, mediaId);
    const { client, bucket } = s3();
    const uploadUrl = await getSignedUrl(
      client,
      new PutObjectCommand({ Bucket: bucket, Key: stagingKey, ContentType: contentType }),
      { expiresIn: UPLOAD_URL_EXPIRES_SECONDS },
    );

    await ctx.runMutation(internal.media.insertRecord, {
      mediaId,
      ownerId,
      kind,
      contentType,
      stagingKey,
    });

    return { mediaId, ownerId, kind, uploadUrl, stagingKey, expiresIn: UPLOAD_URL_EXPIRES_SECONDS };
  },
});

/**
 * GET /media/:id — record + display URLs. Without a public CDN base the frontend can
 * only show the caller's OWN media (presigned GET) — the documented local-dev regime.
 * urls.{orig,med,thumb} are all the same object until the processing pipeline exists.
 */
export const getUrl = action({
  args: { mediaId: v.string(), ownerId: v.string() },
  // Explicit annotations break the getUrl → internal → getUrl type circularity
  // (handler return type + both runQuery results).
  handler: async (ctx, { mediaId, ownerId }): Promise<Record<string, unknown>> => {
    const linkId = requireSubject(await ctx.auth.getUserIdentity());

    const media: Doc<"media"> | null = await ctx.runQuery(internal.media.recordByOwner, {
      ownerId,
      mediaId,
    });
    if (!media) throw new ConvexError({ code: 404, message: "Media not found" });
    // Owner gate: self-owned, or any media whose ownerId is the caller (avatars).
    // Community icons presign for owner/mods via the same ownership rule used on upload.
    if (ownerId !== linkId) {
      await ctx.runQuery(internal.media.assertUpload, { linkId, kind: media.kind, ownerId });
    }
    if (media.status !== MEDIA_STATUS.READY || !media.servingKey) {
      return { ...recordShape(media), urls: undefined };
    }

    const { client, bucket } = s3();
    const url = await getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: bucket, Key: media.servingKey }),
      { expiresIn: GET_URL_EXPIRES_SECONDS },
    );
    return { ...recordShape(media), urls: { orig: url, med: url, thumb: url } };
  },
});

function recordShape(media: {
  mediaId: string;
  ownerId: string;
  kind: string;
  status: string;
  contentType: string;
  width?: number;
  height?: number;
  bytes?: number;
  _creationTime: number;
}): Record<string, unknown> {
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
