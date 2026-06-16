// Media constants — ported from backend/shared/src/constants (items.ts §Media +
// retention.ts) and media-service/src/constants/media.ts.

export const MEDIA_KIND = {
  AVATAR: "avatar",
  COMMUNITY_ICON: "community_icon",
  POLL_QUESTION: "poll_question",
  POLL_OPTION: "poll_option",
} as const;

export type MediaKind = (typeof MEDIA_KIND)[keyof typeof MEDIA_KIND];

export const MEDIA_STATUS = {
  PENDING: "PENDING",
  UPLOADED: "UPLOADED",
  PROCESSING: "PROCESSING",
  READY: "READY",
  FAILED: "FAILED",
  REJECTED: "REJECTED",
  PRESERVED: "PRESERVED",
} as const;

export type MediaStatus = (typeof MEDIA_STATUS)[keyof typeof MEDIA_STATUS];

/** Kinds the upload surface accepts. Poll media (question/option) is uploaded as the
 *  creator's own draft media (ownerId = linkId) before the poll exists — polls.create then
 *  validates it and denormalizes the serving key onto the poll (DESIGN-007). */
export const SUPPORTED_UPLOAD_KINDS = [
  MEDIA_KIND.AVATAR,
  MEDIA_KIND.COMMUNITY_ICON,
  MEDIA_KIND.POLL_QUESTION,
  MEDIA_KIND.POLL_OPTION,
] as const;

// JPEG/PNG only — the moderation gate (Rekognition DetectModerationLabels, DESIGN-007)
// can't scan WebP, so we don't accept what we can't moderate. Re-add WebP once the Lambda
// transcodes it before the scan.
export const MEDIA_CONTENT_TYPES = ["image/jpeg", "image/png"] as const;

/** Abandoned-upload lifetime: PENDING rows older than this are swept (ADR-010; was DDB TTL). */
export const MEDIA_PENDING_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Presigned PUT/GET validity, seconds. */
export const UPLOAD_URL_EXPIRES_SECONDS = 300;
export const GET_URL_EXPIRES_SECONDS = 3600;

export function stagingKey(ownerId: string, mediaId: string): string {
  return `staging/${ownerId}/${mediaId}`;
}
