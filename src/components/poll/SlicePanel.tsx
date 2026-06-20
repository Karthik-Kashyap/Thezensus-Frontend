"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery as useConvexQuery } from "convex/react";
import { BarChart3, Lock } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Poll, PollOption, SliceResult } from "@/lib/types";
import { useSession } from "@/lib/session";
import { compactNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

// Mirrors TIER_DIM_LIMITS in convex/lib/constants/slicing.ts. The backend enforces it (403);
// this only gates the UI so over-limit chips lock instead of erroring.
const TIER_LIMITS: Record<string, number> = { free: 2, pro: 5 };

/**
 * "Break down results" — slice a poll's option bars by community segments (DESIGN-008). Activate
 * up to your tier's limit of segments, pick a value for each, and the SAME option bars refill for
 * that subgroup, with a faint ghost showing the overall baseline. Fetches the cross-tab once per
 * active-segment set; switching values is instant (every cell is already in the response).
 */
export function SlicePanel({ poll, token }: { poll: Poll; token?: string }) {
  const segments = poll.segmentSchema ?? [];
  const { user, isLoading } = useSession();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<string[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [upsell, setUpsell] = useState(false);

  const maxDims = user ? TIER_LIMITS[user.tier ?? "free"] ?? 2 : 0;

  const slice = useConvexQuery(
    api.slices.getSlice,
    user && active.length > 0 ? { pollId: poll.pollId, dims: active, token } : "skip",
  ) as SliceResult | null | undefined;

  const cells = useMemo(() => slice?.cells ?? [], [slice]);
  const loading = !!user && active.length > 0 && slice === undefined;

  // When a fresh cross-tab arrives, default each active segment to the largest surviving cell so
  // a meaningful subgroup shows immediately. Only runs on new data (dep: slice), never fighting a
  // value the user just picked.
  useEffect(() => {
    if (active.length === 0 || cells.length === 0) return;
    const matched = cells.some((c) => active.every((id) => values[id] === c.values[id]));
    if (!matched) {
      const largest = cells.reduce((a, b) => (b.total > a.total ? b : a));
      setValues((prev) => ({ ...prev, ...largest.values }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slice]);

  const displayed = useMemo(
    () => (active.length === 0 ? null : cells.find((c) => active.every((id) => values[id] === c.values[id])) ?? null),
    [cells, active, values],
  );

  // Picking an option from a question's row both activates that segment (adds it to the slice) and
  // sets its value. Clicking the already-selected value clears the segment. At the tier limit, an
  // inactive segment's options are locked and trigger the upsell instead.
  function pickOption(id: string, label: string) {
    setUpsell(false);
    if (!active.includes(id)) {
      if (active.length >= maxDims) {
        setUpsell(true);
        return;
      }
      setActive((prev) => [...prev, id]);
      setValues((v) => ({ ...v, [id]: label }));
      return;
    }
    if (values[id] === label) {
      setActive((prev) => prev.filter((x) => x !== id));
      setValues((v) => {
        const next = { ...v };
        delete next[id];
        return next;
      });
      return;
    }
    setValues((v) => ({ ...v, [id]: label }));
  }

  const baseCounts = poll.currentEdition.optionCounts ?? {};
  const baseTotal = poll.currentEdition.voteCount ?? 0;
  const showBaseline = active.length === 0 || loading || !displayed;

  if (!open) {
    return (
      <Button variant="outline" size="sm" className="gap-2" onClick={() => setOpen(true)}>
        <BarChart3 className="h-4 w-4" /> Break down results
      </Button>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-4 pt-5">
        <div className="flex items-center justify-between">
          <span className="font-display text-lg font-semibold">Break down results</span>
          <button onClick={() => setOpen(false)} className="text-sm text-muted-foreground hover:text-foreground">
            Hide
          </button>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !user ? (
          <p className="text-sm text-muted-foreground">Sign in to break down results by member segment.</p>
        ) : (
          <>
            <div className="divide-y divide-border rounded-lg border border-border">
              {segments.map((seg) => {
                const on = active.includes(seg.id);
                const locked = !on && active.length >= maxDims;
                return (
                  <div
                    key={seg.id}
                    className="grid grid-cols-[8rem_1fr] items-start gap-3 px-3 py-2.5"
                  >
                    <span
                      className={cn(
                        "flex items-center gap-1.5 pt-0.5 text-sm font-medium",
                        on ? "text-primary" : "text-foreground",
                      )}
                    >
                      {locked && <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden />}
                      {seg.label}
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {seg.options.map((opt) => {
                        const sel = on && values[seg.id] === opt.label;
                        return (
                          <button
                            key={opt.i}
                            aria-pressed={sel}
                            disabled={locked}
                            onClick={() => pickOption(seg.id, opt.label)}
                            className={cn(
                              "rounded-full border px-2.5 py-0.5 text-xs transition",
                              sel
                                ? "border-primary bg-primary/15 text-primary"
                                : "border-border text-muted-foreground hover:bg-muted",
                              locked && "cursor-not-allowed opacity-50 hover:bg-transparent",
                            )}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {upsell && (
              <p className="text-sm text-muted-foreground">
                <Lock className="mr-1 inline h-3.5 w-3.5" aria-hidden />
                Combining more than {maxDims} segments is a <span className="text-primary">Pro</span> feature.
              </p>
            )}

            <p className="text-sm text-muted-foreground">
              {active.length === 0
                ? `All voters · ${compactNumber(baseTotal)} votes`
                : loading
                  ? "Loading breakdown…"
                  : displayed
                    ? `${active.map((id) => values[id]).filter(Boolean).join(" · ")} · ${compactNumber(displayed.total)} votes`
                    : "Fewer than 5 voters in this group — pick another combination."}
            </p>

            <SliceBars
              options={poll.options}
              subCounts={showBaseline ? baseCounts : displayed!.counts}
              subTotal={showBaseline ? baseTotal : displayed!.total}
              baseCounts={baseCounts}
              baseTotal={baseTotal}
            />

            <div className="flex gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-[2px] bg-primary/30" aria-hidden /> Selected group
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-[2px] bg-primary/10" aria-hidden /> All voters
              </span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** The option bars — a faint ghost at the overall baseline %, a solid fill at the subgroup %.
 *  Mirrors PollResults' look; widths animate so the bars visibly refill when values change. */
function SliceBars({
  options,
  subCounts,
  subTotal,
  baseCounts,
  baseTotal,
}: {
  options: PollOption[];
  subCounts: Record<string, number>;
  subTotal: number;
  baseCounts: Record<string, number>;
  baseTotal: number;
}) {
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(id);
  }, []);

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
