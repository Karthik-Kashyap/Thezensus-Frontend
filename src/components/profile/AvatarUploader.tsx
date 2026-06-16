"use client";

import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Camera, Loader2 } from "lucide-react";
import { uploadImage, MediaRejectedError } from "@/lib/media";
import { updateMe } from "@/lib/profile";
import { ACCEPTED_IMAGE_TYPES, MAX_AVATAR_BYTES } from "@/lib/constants";
import type { MeProfile } from "@/lib/types";
import { UserAvatar } from "@/components/common/UserAvatar";

/**
 * Avatar with an overlay "change" button. Runs the full media flow
 * (initiate → PUT → complete) then attaches the mediaId to the profile via PATCH /users/me.
 */
export function AvatarUploader({ user }: { user: MeProfile }) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  // Bust the avatar cache after a successful change so the new image resolves.
  const [version, setVersion] = useState(0);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type as (typeof ACCEPTED_IMAGE_TYPES)[number])) {
      toast.error("Please choose a JPEG or PNG image.");
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      toast.error("Image is too large (max 5 MB).");
      return;
    }
    setBusy(true);
    try {
      const media = await uploadImage(file, "avatar");
      const updated = await updateMe({ avatarMediaId: media.mediaId });
      queryClient.setQueryData(["me"], updated);
      setVersion((v) => v + 1);
      toast.success("Avatar updated");
    } catch (err) {
      toast.error(
        err instanceof MediaRejectedError
          ? "That image isn’t allowed."
          : "Could not upload that image. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative">
      <UserAvatar
        key={version}
        name={user.displayName}
        mediaId={user.avatarMediaId}
        ownerId={user.linkId}
        mediaKey={user.avatarKey}
        isSelf
        className="h-20 w-20 ring-4 ring-card shadow-md"
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        aria-label="Change avatar"
        className="absolute -bottom-1 -right-1 grid h-8 w-8 place-items-center rounded-full bg-primary text-primary-foreground shadow-md transition hover:bg-primary/90 disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(",")}
        className="hidden"
        onChange={onPick}
      />
    </div>
  );
}
