"use client";

import { Check } from "lucide-react";
import type { PollOption } from "@/lib/types";
import { compactNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

interface PollResultsProps {
  options: PollOption[];
  optionCounts: Record<string, number>;
  totalVotes: number;
  /** The option the current user voted for (highlighted). */
  selectedId?: string | null;
}

/** Animated horizontal result bars. Width transitions whenever counts change (live-ish). */
export function PollResults({ options, optionCounts, totalVotes, selectedId }: PollResultsProps) {
  const max = Math.max(1, ...options.map((o) => optionCounts[o.id] ?? 0));

  return (
    <div className="space-y-2.5">
      {options.map((o, i) => {
        const count = optionCounts[o.id] ?? 0;
        const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
        const isLeader = count === max && count > 0;
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
                mine
                  ? "bg-primary/18"
                  : isLeader
                    ? "bg-secondary/14"
                    : "bg-muted",
              )}
              style={{ width: `${pct}%` }}
              aria-hidden
            />
            <div className="relative flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 font-medium">
                {mine && <Check className="h-4 w-4 text-primary" />}
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
