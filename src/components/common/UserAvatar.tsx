"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useMediaUrl } from "@/lib/media-url";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

interface UserAvatarProps {
  name?: string | null;
  mediaId?: string | null;
  /** The media owner id (= userId for avatars). Required to presign own media locally. */
  ownerId?: string | null;
  mediaKey?: string | null;
  /** True when this is the signed-in user's own avatar (enables local presign). */
  isSelf?: boolean;
  className?: string;
}

/** Avatar that resolves a serving key to a URL, falling back to initials. */
export function UserAvatar({ name, mediaId, ownerId, mediaKey, isSelf, className }: UserAvatarProps) {
  const url = useMediaUrl({ mediaId, ownerId, key: mediaKey, isSelf });
  return (
    <Avatar className={cn(className)}>
      {url && <AvatarImage src={url} alt={name ?? ""} />}
      <AvatarFallback>{initials(name)}</AvatarFallback>
    </Avatar>
  );
}
