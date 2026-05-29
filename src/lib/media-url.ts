"use client";

// Resolves a stored serving KEY (e.g. "serving/m_…/orig.webp") into a displayable URL.
//
// Two regimes:
//  • Cloud: NEXT_PUBLIC_MEDIA_BASE is set (CloudFront). URL = `${base}/${key}` — public, sync.
//  • Local: no public base. media-service GET is owner-gated, so we can only presign the
//    CURRENT user's OWN media. Everyone else falls back to an initials avatar (handled by the
//    Avatar component when this returns null). This is an expected local-dev limitation.

import { useEffect, useState } from "react";
import { getMedia } from "./media";

const MEDIA_BASE = process.env.NEXT_PUBLIC_MEDIA_BASE ?? "";

/** Synchronous public URL from a serving key, or null if no public base is configured. */
export function publicMediaUrl(key?: string | null): string | null {
  if (!key) return null;
  if (!MEDIA_BASE) return null;
  return `${MEDIA_BASE.replace(/\/$/, "")}/${key.replace(/^\//, "")}`;
}

interface ResolveArgs {
  mediaId?: string | null;
  ownerId?: string | null;
  key?: string | null;
  /** True when the media belongs to the signed-in user (enables local presign fallback). */
  isSelf?: boolean;
}

/**
 * React hook returning a displayable image URL or null (→ caller shows initials fallback).
 * Prefers the public base; otherwise presigns via media-service, but only for the user's own media.
 */
export function useMediaUrl({ mediaId, ownerId, key, isSelf }: ResolveArgs): string | null {
  const pub = publicMediaUrl(key);
  const [url, setUrl] = useState<string | null>(pub);

  useEffect(() => {
    if (pub) {
      setUrl(pub);
      return;
    }
    if (!isSelf || !mediaId || !ownerId) {
      setUrl(null);
      return;
    }
    let alive = true;
    getMedia(mediaId, ownerId)
      .then((m) => alive && setUrl(m.urls?.orig ?? null))
      .catch(() => alive && setUrl(null));
    return () => {
      alive = false;
    };
  }, [pub, isSelf, mediaId, ownerId]);

  return url;
}
