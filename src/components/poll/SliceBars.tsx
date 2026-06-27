"use client";

import { useEffect, useState } from "react";
import type { PollOption } from "@/lib/types";
import { compactNumber } from "@/lib/format";

/**
 * The option bars shared by both breakdown rails (segments + demographics): a faint ghost at
 * the overall baseline %, a solid fill at the selected subgroup %. Mirrors PollResults' look;
 * widths animate so the bars visibly refill when the subgroup changes. `subKey` resets the grow
 * animation whenever the caller switches subgroup, so the refill re-plays on each pick.
 */
export function SliceBars({
  options,
  subCounts,
  subTotal,
  baseCounts,
  baseTotal,
  subKey,
}: {
  options: PollOption[];
  subCounts: Record<string, number>;
  subTotal: number;
  baseCounts: Record<string, number>;
  baseTotal: number;
  /** Changing this re-triggers the width animation (e.g. the active subgroup value). */
  subKey?: string;
}) {
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    setGrown(false);
    const id = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(id);
  }, [subKey]);

  return (
    <div className="space-y-2.5">
      {options.map((o, i) => {
        const count = subCounts[o.id] ?? 0;
        const pct = subTotal > 0 ? Math.round((count / subTotal) * 100) : 0;
        const basePct = baseTotal > 0 ? Math.round(((baseCounts[o.id] ?? 0) / baseTotal) * 100) : 0;
        return (
          <div key={o.id} className="relative overflow-hidden rounded-lg border border-border px-4 py-3">
            <div
              className="absolute inset-y-0 left-0 bg-primary/10 transition-[width] duration-700 ease-out"
              style={{ width: grown ? `${basePct}%` : "0%" }}
              aria-hidden
            />
            <div
              className="absolute inset-y-0 left-0 bg-primary/30 transition-[width] duration-700 ease-out"
              style={{ width: grown ? `${pct}%` : "0%", transitionDelay: `${i * 80}ms` }}
              aria-hidden
            />
            <div className="relative flex items-center justify-between gap-3">
              <span className="font-medium">{o.label}</span>
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
