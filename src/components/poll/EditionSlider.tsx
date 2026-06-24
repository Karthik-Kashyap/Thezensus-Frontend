"use client";

import { useRef } from "react";
import { useQuery as useConvexQuery } from "convex/react";
import { History } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { EditionList, Recurrence } from "@/lib/types";
import { formatEditionLabel } from "@/lib/format";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// Half the dot footprint, in px. Insets the rail/dots so the end dots sit fully on the track,
// and is the geometry both the dot positions and the click/drag hit-test share (so a click
// always lands on the dot under the cursor). Matches the `inset-x-2` (0.5rem) rail padding.
const INSET = 8;

/**
 * Edition history as a discrete slider: every edition is a dot at its exact even-spaced position
 * (N editions → 0, 1/(N-1), …, 1), oldest on the left and the live (current) edition pinned right.
 * Hovering a dot shows its date; clicking, dragging, or arrow-keying snaps to that edition and the
 * parent swaps the ballot for its read-only results. Renders nothing until the list loads, or when
 * there's only the current edition.
 */
export function EditionSlider({
  pollId,
  token,
  recurrence,
  value,
  onChange,
}: {
  pollId: string;
  token?: string;
  recurrence: Recurrence;
  /** The currently-selected label (the current edition's label = "viewing live"). */
  value: string;
  onChange: (label: string) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const data = useConvexQuery(api.polls.listEditions, { pollId, token }) as
    | EditionList
    | null
    | undefined;

  // Nothing to slide through until there's more than one edition.
  if (!data || data.labels.length <= 1) return null;

  // listEditions is newest-first; the slider runs oldest → newest (current pinned to the right).
  const chronological = [...data.labels].reverse();
  const last = chronological.length - 1;
  const index = Math.max(0, chronological.indexOf(value));
  const isCurrent = value === data.current;

  /** Map a pointer x to the nearest edition stop and select it (shared by click + drag). */
  const pickAt = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const usable = Math.max(1, rect.width - 2 * INSET);
    const frac = (clientX - rect.left - INSET) / usable;
    const i = Math.round(Math.min(1, Math.max(0, frac)) * last);
    if (i !== index) onChange(chronological[i]);
  };

  return (
    <div className="space-y-2 rounded-lg border bg-muted/30 px-4 py-3">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-2 text-muted-foreground">
          <History className="h-4 w-4" /> Edition
        </span>
        <span className="font-medium">
          {formatEditionLabel(recurrence, value)}
          {isCurrent && <span className="ml-1.5 text-xs font-normal text-primary">· current</span>}
        </span>
      </div>

      <TooltipProvider delayDuration={120}>
        <div
          ref={trackRef}
          role="slider"
          tabIndex={0}
          aria-label="Select which edition's results to view"
          aria-valuemin={0}
          aria-valuemax={last}
          aria-valuenow={index}
          aria-valuetext={formatEditionLabel(recurrence, value)}
          className="relative h-8 cursor-pointer touch-none select-none outline-none focus-visible:ring-2 focus-visible:ring-ring/40 rounded"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            pickAt(e.clientX);
          }}
          onPointerMove={(e) => {
            if (e.buttons === 1) pickAt(e.clientX);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft" && index > 0) onChange(chronological[index - 1]);
            else if (e.key === "ArrowRight" && index < last) onChange(chronological[index + 1]);
          }}
        >
          {/* rail + the filled portion up to the selected stop */}
          <div className="absolute inset-x-2 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-border" />
          <div
            className="absolute left-2 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-primary"
            style={{ width: `calc((100% - 1rem) * ${last === 0 ? 0 : index / last})` }}
          />

          {/* one dot per edition, at its exact even-spaced position */}
          {chronological.map((label, i) => {
            const selected = i === index;
            return (
              <Tooltip key={label}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-label={formatEditionLabel(recurrence, label)}
                    onClick={() => onChange(label)}
                    className="absolute top-1/2 grid -translate-x-1/2 -translate-y-1/2 place-items-center"
                    style={{ left: `calc(0.5rem + (100% - 1rem) * ${last === 0 ? 0 : i / last})` }}
                  >
                    <span
                      className={cn(
                        "block rounded-full border-2 border-background transition",
                        selected
                          ? "h-5 w-5 bg-primary shadow"
                          : "h-4 w-4 bg-muted-foreground hover:bg-primary",
                      )}
                    />
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  {formatEditionLabel(recurrence, label)}
                  {label === data.current ? " (current)" : ""}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </TooltipProvider>

      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{formatEditionLabel(recurrence, chronological[0])}</span>
        <span>Current</span>
      </div>
    </div>
  );
}
