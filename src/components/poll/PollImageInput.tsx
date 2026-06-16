"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { ImagePlus, Loader2, X } from "lucide-react";
import { uploadImage, MediaRejectedError } from "@/lib/media";
import { ACCEPTED_IMAGE_TYPES, MAX_POLL_IMAGE_BYTES } from "@/lib/constants";
import type { MediaKind } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface PollImageValue {
  mediaId: string;
  /** Local object-URL preview (no extra round-trip while editing). */
  previewUrl: string;
}

/**
 * Optional image attach for a poll question or option. On pick it runs the full media flow
 * (initiate → presigned PUT → complete) and reports back the READY mediaId; the poll-create
 * mutation later validates + denormalizes it (resolvePollMedia). Clearing drops the attachment —
 * the orphaned upload is reaped by the abandoned-upload sweep, exactly like a cancelled avatar change.
 */
export function PollImageInput({
  kind,
  value,
  onChange,
  onBusyChange,
  label,
  className,
}: {
  kind: Extract<MediaKind, "poll_question" | "poll_option">;
  value: PollImageValue | null;
  onChange: (v: PollImageValue | null) => void;
  /** Reports upload/scan in-flight so the form can block submit until the image clears. */
  onBusyChange?: (busy: boolean) => void;
  label: string;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  function setBusy_(b: boolean) {
    setBusy(b);
    onBusyChange?.(b);
  }

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type as (typeof ACCEPTED_IMAGE_TYPES)[number])) {
      toast.error("Please choose a JPEG or PNG image.");
      return;
    }
    if (file.size > MAX_POLL_IMAGE_BYTES) {
      toast.error("Image is too large (max 10 MB).");
      return;
    }
    setBusy_(true);
    try {
      const media = await uploadImage(file, kind);
      onChange({ mediaId: media.mediaId, previewUrl: URL.createObjectURL(file) });
    } catch (err) {
      toast.error(
        err instanceof MediaRejectedError
          ? "That image isn’t allowed."
          : "Could not upload that image. Try again.",
      );
    } finally {
      setBusy_(false);
    }
  }

  if (value) {
    return (
      <div className={cn("relative overflow-hidden rounded-lg border", className)}>
        {/* eslint-disable-next-line @next/next/no-img-element -- local object-URL preview */}
        <img src={value.previewUrl} alt={label} className="h-full w-full object-cover" />
        <button
          type="button"
          onClick={() => onChange(null)}
          aria-label={`Remove ${label}`}
          className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-background/80 text-foreground shadow ring-1 ring-border transition hover:bg-background"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        aria-label={`Add ${label}`}
        className={cn(
          "grid place-items-center rounded-lg border border-dashed text-muted-foreground transition hover:border-primary/50 hover:text-foreground disabled:opacity-60",
          className,
        )}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(",")}
        className="hidden"
        onChange={onPick}
      />
    </>
  );
}
