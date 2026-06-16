"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import type { PollOption } from "@/lib/types";
import { compactNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PollImage } from "./PollImage";

interface PollResultsProps {
  options: PollOption[];
  optionCounts: Record<string, number>;
  totalVotes: number;
  /** The option the current user voted for (highlighted). */
  selectedId?: string | null;
  /** Owner (poll creator linkId) + self flag for resolving option-image URLs (see PollImage). */
  mediaOwnerId?: string | null;
  mediaIsSelf?: boolean;
}

/** Animated horizontal result bars. Bars grow from 0 on first appearance, then transition
 *  whenever counts change (live-ish). Your pick is the bright bar; the rest are a faint tint. */
export function PollResults({
  options,
  optionCounts,
  totalVotes,
  selectedId,
  mediaOwnerId,
  mediaIsSelf,
}: PollResultsProps) {
  // CSS width transitions only fire on a *change*, not on mount — so the freshly-mounted bars
  // would otherwise snap straight to their final width. Start at 0, then grow on the next frame.
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div className="space-y-2.5">
      {options.map((o, i) => {
        const count = optionCounts[o.id] ?? 0;
        const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
        const mine = selectedId === o.id;
        return (
          <div
            key={o.id}
            className={cn(
              "relative overflow-hidden rounded-lg border px-4 py-3",
              mine ? "border-primary" : "border-border",
            )}
          >
            <div
              className={cn(
                "absolute inset-y-0 left-0 transition-[width] duration-700 ease-out",
                mine ? "bg-primary/30" : "bg-primary/10",
              )}
              style={{ width: grown ? `${pct}%` : "0%", transitionDelay: `${i * 80}ms` }}
              aria-hidden
            />
            <div className="relative flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 font-medium">
                {mine && <Check className="h-4 w-4 text-primary" />}
                <PollImage
                  mediaId={o.mediaId}
                  mediaKey={o.mediaKey}
                  ownerId={mediaOwnerId}
                  isSelf={mediaIsSelf}
                  alt={o.label}
                  className="h-8 w-8 shrink-0 rounded-md"
                />
                {o.label}
              </span>
              <span className="flex items-center gap-2 text-sm tabular-nums text-muted-foreground">
                <span className="font-semibold text-foreground">{pct}%</span>
                <span>{compactNumber(count)}</span>
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
