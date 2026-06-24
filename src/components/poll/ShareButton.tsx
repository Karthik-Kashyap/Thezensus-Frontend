"use client";

import { useState } from "react";
import { useQuery as useConvexQuery } from "convex/react";
import { Check, Copy, ExternalLink, Share2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { EditionList, Recurrence } from "@/lib/types";
import { routes } from "@/lib/constants";
import { formatEditionLabel } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * Share entry point: a modal offering the poll link (default — copies to clipboard, same as the
 * old one-click button) and, when a rich card exists, a downloadable results image. The image is
 * the /poll/<id>/card route (height grows with the option count); the "options shown" input lets
 * the user render anywhere from 1 to every option. Opens in a new tab so they can save / reshare.
 * `canShareImage` is false for LINK polls (their card is the generic one).
 */
export function ShareButton({
  pollId,
  token,
  recurrence = "NONE",
  canShareImage = false,
  optionCount = 0,
  imageShowsResults = false,
}: {
  pollId: string;
  token?: string;
  /** The poll's cadence — gates the "share a specific edition" picker (recurring polls only). */
  recurrence?: Recurrence;
  canShareImage?: boolean;
  optionCount?: number;
  imageShowsResults?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  // Default to 8 options, or all of them if the poll has fewer (matches "show all when < 8").
  const [countDraft, setCountDraft] = useState(() => String(Math.min(8, Math.max(1, optionCount || 8))));
  // "" = share the current/live edition (the default). A past label = share that edition.
  const [editionDraft, setEditionDraft] = useState("");

  // Recurring polls only: the edition list for the picker (current always present). "skip" keeps
  // one-off polls from issuing a needless query.
  const editions = useConvexQuery(
    api.polls.listEditions,
    recurrence !== "NONE" ? { pollId, token } : "skip",
  ) as EditionList | null | undefined;
  const hasHistory = !!editions && editions.labels.length > 1;
  // Only carry the param when an actual past edition is chosen — keeps current-edition links clean.
  const shareEdition = editions && editionDraft && editionDraft !== editions.current ? editionDraft : null;

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  // routes.poll may already carry ?token= (LINK polls); append edition with the right separator.
  const pollPath = routes.poll(pollId, token);
  const sep = pollPath.includes("?") ? "&" : "?";
  const link = `${origin}${pollPath}${shareEdition ? `${sep}edition=${encodeURIComponent(shareEdition)}` : ""}`;

  // The numeric count actually used for the image: clamped to [1, optionCount]. Invalid/empty
  // input falls back to the default rather than breaking the URL.
  function clampCount(raw: string): number {
    const n = Number.parseInt(raw, 10);
    const fallback = Math.min(8, Math.max(1, optionCount || 8));
    if (Number.isNaN(n)) return fallback;
    return Math.max(1, Math.min(n, optionCount || n));
  }
  const count = clampCount(countDraft);
  const imageUrl =
    `${origin}/poll/${encodeURIComponent(pollId)}/card?count=${count}` +
    (shareEdition ? `&edition=${encodeURIComponent(shareEdition)}` : "");

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast.success("Link copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn’t copy the link.");
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Share2 className="h-4 w-4" />
          Share
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Share this poll</DialogTitle>
          <DialogDescription>
            {canShareImage ? "Copy the link, or download the share image." : "Copy the link to share this poll."}
          </DialogDescription>
        </DialogHeader>

        {/* Recurring polls: pick which edition to share (link + image follow the choice). */}
        {hasHistory && editions && (
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="share-edition" className="text-sm font-normal text-muted-foreground">
              Edition
            </Label>
            <Select
              id="share-edition"
              value={editionDraft || editions.current}
              onChange={(e) => setEditionDraft(e.target.value)}
              className="h-9 max-w-[16rem]"
            >
              {editions.labels.map((label) => (
                <option key={label} value={label}>
                  {formatEditionLabel(recurrence, label)}
                  {label === editions.current ? " (current)" : ""}
                </option>
              ))}
            </Select>
          </div>
        )}

        {/* Default: the link. */}
        <div className="flex items-center gap-2">
          <Input
            readOnly
            value={link}
            onFocus={(e) => e.currentTarget.select()}
            className="text-sm"
            aria-label="Poll link"
          />
          <Button onClick={copyLink} size="sm" className="shrink-0">
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>

        {/* Optional: the share-card image (opens in a new tab to save / re-share). */}
        {canShareImage && (
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              or share as image
              <span className="h-px flex-1 bg-border" />
            </div>

            {imageShowsResults && optionCount > 1 && (
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="og-count" className="text-sm font-normal text-muted-foreground">
                  Options shown in image
                </Label>
                <Input
                  id="og-count"
                  type="number"
                  min={1}
                  max={optionCount}
                  value={countDraft}
                  onChange={(e) => setCountDraft(e.target.value)}
                  onBlur={() => setCountDraft(String(count))}
                  className="w-20"
                />
              </div>
            )}

            <div className="max-h-[55vh] overflow-y-auto rounded-lg border">
              <a href={imageUrl} target="_blank" rel="noopener noreferrer" className="block transition hover:opacity-90">
                {/* eslint-disable-next-line @next/next/no-img-element -- dynamically generated image, not a static asset */}
                <img src={imageUrl} alt="Preview of the poll share image" className="w-full bg-muted" />
              </a>
            </div>

            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => window.open(imageUrl, "_blank", "noopener,noreferrer")}
            >
              <ExternalLink className="h-4 w-4" />
              Open image in new tab
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
