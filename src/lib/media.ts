// Media client — now Convex (api.media.* + api.mediaActions.* for the S3-presigning
// halves) + the end-to-end upload flow.
//
// Upload is three hops: initiate (presigned PUT) → PUT bytes straight to S3 (never
// through our backend) → complete. When the moderation pipeline is enabled (DESIGN-007),
// `complete` only marks UPLOADED and the S3-event Lambda (Rekognition) decides
// READY/REJECTED asynchronously — so `uploadImage` then WAITS for that verdict before
// resolving, and throws MediaRejectedError if the image isn't allowed. With moderation
// off, `complete` returns READY directly and the wait is a no-op.

import { convex } from "./convexClient";
import { api } from "../../convex/_generated/api";
import { withApiError } from "./convexErrors";
import type {
  InitiateUploadInput,
  InitiateUploadResult,
  MediaContentType,
  MediaKind,
  MediaRecord,
} from "./types";

/** Thrown when the moderation gate rejects an upload (NSFW) — callers show "not allowed". */
export class MediaRejectedError extends Error {
  constructor() {
    super("That image isn’t allowed.");
    this.name = "MediaRejectedError";
  }
}

export const initiateUpload = (input: InitiateUploadInput) =>
  withApiError(
    convex.action(api.mediaActions.initiate, input),
  ) as unknown as Promise<InitiateUploadResult>;

export const completeUpload = (mediaId: string, ownerId: string) =>
  withApiError(
    convex.mutation(api.media.complete, { mediaId, ownerId }),
  ) as unknown as Promise<MediaRecord>;

/** Record + presigned display URLs (own media only without a public CDN base). */
export const getMedia = (mediaId: string, ownerId: string) =>
  withApiError(
    convex.action(api.mediaActions.getUrl, { mediaId, ownerId }),
  ) as unknown as Promise<MediaRecord>;

/** One-shot status read (the upload waiter polls this); owner-gated server-side. */
const readStatus = (mediaId: string, ownerId: string) =>
  convex.query(api.media.status, { mediaId, ownerId }) as unknown as Promise<MediaRecord | null>;

const READY_POLL_MS = 1000;
const READY_TIMEOUT_MS = 30_000;

/**
 * Wait for the moderation pipeline's terminal verdict. READY → resolve; REJECTED →
 * MediaRejectedError; FAILED/timeout → generic error (fail-closed — never treat an
 * unresolved scan as servable).
 */
async function waitForReady(mediaId: string, ownerId: string): Promise<MediaRecord> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  for (;;) {
    const rec = await readStatus(mediaId, ownerId);
    if (rec?.status === "READY") return rec;
    if (rec?.status === "REJECTED") throw new MediaRejectedError();
    if (rec?.status === "FAILED") throw new Error("Image processing failed");
    if (Date.now() > deadline) throw new Error("Image is still processing — try again");
    await new Promise((r) => setTimeout(r, READY_POLL_MS));
  }
}

/**
 * Full image upload: initiate → presigned PUT → complete → (if moderation is on) wait
 * for the scan verdict. The presigned PUT goes directly to storage with the SAME
 * content-type used to initiate. Resolves with the READY media record (carrying the
 * mediaId to attach); throws MediaRejectedError if the gate rejects it.
 */
export async function uploadImage(
  file: File,
  kind: MediaKind,
  communityId?: string,
): Promise<MediaRecord> {
  const contentType = file.type as MediaContentType;
  const { mediaId, ownerId, uploadUrl } = await initiateUpload({ kind, contentType, communityId });

  const put = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "content-type": contentType },
    body: file,
  });
  if (!put.ok) throw new Error(`Upload failed (${put.status})`);

  const rec = await completeUpload(mediaId, ownerId);
  if (rec.status === "READY") return rec; // moderation off (or scan already cleared)
  return waitForReady(mediaId, ownerId); // moderation on — await the async verdict
}
