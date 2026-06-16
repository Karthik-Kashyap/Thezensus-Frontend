"use client";

import { useMediaUrl } from "@/lib/media-url";
import { cn } from "@/lib/utils";

interface PollImageProps {
  mediaId?: string | null;
  mediaKey?: string | null;
  /** The media owner id (= the poll creator's linkId). Required to presign own media locally. */
  ownerId?: string | null;
  /** True when the signed-in user created this poll (enables the local presign fallback). */
  isSelf?: boolean;
  alt: string;
  className?: string;
}

/**
 * A poll question/option image. Resolves the denormalized serving key to a URL exactly like
 * UserAvatar — a public CDN base (NEXT_PUBLIC_MEDIA_BASE) when configured, otherwise a presigned
 * GET of the viewer's OWN media in local dev — and renders nothing when there's no image or it
 * can't be resolved, so callers can drop it in unconditionally. Phase A serving carries the same
 * local-dev limitation as avatars: a non-creator sees poll images only once a public CDN base is set.
 */
export function PollImage({ mediaId, mediaKey, ownerId, isSelf, alt, className }: PollImageProps) {
  const url = useMediaUrl({ mediaId, ownerId, key: mediaKey, isSelf });
  if (!url) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- media is on S3/CloudFront, not a static asset
    <img src={url} alt={alt} loading="lazy" className={cn("object-cover", className)} />
  );
}
