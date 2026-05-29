// media-service client + the end-to-end upload flow.
//
// Upload is three hops: initiate (get a presigned PUT) → PUT bytes straight to storage
// (NOT through the gateway) → complete (server processes → READY + serving URLs).

import { api } from "./api";
import type {
  InitiateUploadInput,
  InitiateUploadResult,
  MediaContentType,
  MediaKind,
  MediaRecord,
} from "./types";

export const initiateUpload = (input: InitiateUploadInput) =>
  api.post<InitiateUploadResult>("/media", input);

export const completeUpload = (mediaId: string, ownerId: string) =>
  api.post<MediaRecord>(`/media/${encodeURIComponent(mediaId)}/complete`, { ownerId });

export const getMedia = (mediaId: string, ownerId: string) =>
  api.get<MediaRecord>(`/media/${encodeURIComponent(mediaId)}?ownerId=${encodeURIComponent(ownerId)}`);

/**
 * Full avatar/icon upload: initiate → presigned PUT → complete.
 * The presigned PUT goes directly to storage with the SAME content-type used to initiate.
 * Returns the READY media record (carrying the serving urls + mediaId to attach).
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

  return completeUpload(mediaId, ownerId);
}
