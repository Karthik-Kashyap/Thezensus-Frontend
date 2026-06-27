"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery as useConvexQuery } from "convex/react";
import { Users } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { DemographicBreakdownResult, DemographicDimension, Poll } from "@/lib/types";
import { compactNumber } from "@/lib/format";
import { countryLabel, stateLabel } from "@/lib/geo";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { SliceBars } from "./SliceBars";

// The four flat marginals (DESIGN-008) — viewed one at a time, never crossed (that's the segment
// panel's paywalled job). Order matches the tally's TALLY_DIMENSION.
const DIMENSIONS: { key: DemographicDimension; label: string }[] = [
  { key: "gender", label: "Gender" },
  { key: "age", label: "Age" },
  { key: "country", label: "Country" },
  { key: "state", label: "State" },
];

// Gender is stored as a lowercase code (mirrors GENDER_OPTIONS) — map to a display label.
const GENDER_LABELS: Record<string, string> = {
  female: "Female",
  male: "Male",
  nonbinary: "Non-binary",
  other: "Other",
  prefer_not_to_say: "Prefer not to say",
};

/** Resolve a raw marginal value to its display label. Age buckets are already human ("25-34"). */
function valueLabel(dimension: DemographicDimension, value: string): string {
  switch (dimension) {
    case "country":
      return countryLabel(value);
    case "state":
      return stateLabel(value);
    case "gender":
      return GENDER_LABELS[value] ?? value;
    default:
      return value; // age bucket
  }
}

// Above this many values, a dropdown beats a chip row (country/state can be long lists).
const CHIP_THRESHOLD = 6;

/**
 * "Break down by demographics" — slice a poll's option bars by ONE demographic dimension
 * (gender / age / country / state). FREE and works for anyone who can see the poll (the
 * backend k-anonymizes); the paid, combinable cross-tab is SlicePanel's job. Pick a dimension,
 * then a value, and the same option bars refill for that subgroup over a ghost of the overall
 * baseline. Only meaningful on standard (attributable) ballots — anonymous ballots capture no
 * demographics, so the parent gates on that.
 */
export function DemographicBreakdown({ poll, token }: { poll: Poll; token?: string }) {
  const [open, setOpen] = useState(false);
  const [dimension, setDimension] = useState<DemographicDimension>("gender");
  const [value, setValue] = useState<string | null>(null);

  const data = useConvexQuery(
    api.slices.getDemographicBreakdown,
    open ? { pollId: poll.pollId, dimension, token } : "skip",
  ) as DemographicBreakdownResult | null | undefined;

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const loading = open && data === undefined;

  // On fresh rows (dimension switch / new data): keep the current value if it survived, else
  // default to the largest surviving group so a meaningful subgroup shows immediately.
  useEffect(() => {
    if (rows.length === 0) {
      setValue(null);
      return;
    }
    setValue((prev) =>
      prev && rows.some((r) => r.value === prev)
        ? prev
        : rows.reduce((a, b) => (b.total > a.total ? b : a)).value,
    );
  }, [rows]);

  const selected = useMemo(() => rows.find((r) => r.value === value) ?? null, [rows, value]);

  const baseCounts = poll.currentEdition.optionCounts ?? {};
  const baseTotal = poll.currentEdition.voteCount ?? 0;
  const showBaseline = loading || !selected;

  if (!open) {
    return (
      <Button variant="outline" size="sm" className="gap-2" onClick={() => setOpen(true)}>
        <Users className="h-4 w-4" /> Break down by demographics
      </Button>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-4 pt-5">
        <div className="flex items-center justify-between">
          <span className="font-display text-lg font-semibold">Break down by demographics</span>
          <button onClick={() => setOpen(false)} className="text-sm text-muted-foreground hover:text-foreground">
            Hide
          </button>
        </div>

        {/* Dimension picker — one marginal at a time (no crossing). */}
        <div className="flex flex-wrap gap-2">
          {DIMENSIONS.map((d) => (
            <button
              key={d.key}
              aria-pressed={dimension === d.key}
              onClick={() => setDimension(d.key)}
              className={cn(
                "rounded-full border px-3 py-1 text-sm transition",
                dimension === d.key
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border text-muted-foreground hover:bg-muted",
              )}
            >
              {d.label}
            </button>
          ))}
        </div>

        {/* Value picker — chips for short lists, a dropdown for long ones (countries/states). */}
        {rows.length > 0 && rows.length <= CHIP_THRESHOLD && (
          <div className="flex flex-wrap gap-2">
            {rows.map((r) => (
              <button
                key={r.value}
                aria-pressed={value === r.value}
                onClick={() => setValue(r.value)}
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-xs transition",
                  value === r.value
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border text-muted-foreground hover:bg-muted",
                )}
              >
                {valueLabel(dimension, r.value)}
              </button>
            ))}
          </div>
        )}
        {rows.length > CHIP_THRESHOLD && (
          <Select value={value ?? ""} onChange={(e) => setValue(e.target.value)}>
            {rows.map((r) => (
              <option key={r.value} value={r.value}>
                {valueLabel(dimension, r.value)} · {compactNumber(r.total)}
              </option>
            ))}
          </Select>
        )}

        <p className="text-sm text-muted-foreground">
          {loading
            ? "Loading breakdown…"
            : rows.length === 0
              ? "Not enough voters have shared this demographic yet."
              : selected
                ? `${valueLabel(dimension, selected.value)} · ${compactNumber(selected.total)} votes`
                : "Pick a group to see its breakdown."}
        </p>

        <SliceBars
          options={poll.options}
          subCounts={showBaseline ? baseCounts : selected!.counts}
          subTotal={showBaseline ? baseTotal : selected!.total}
          baseCounts={baseCounts}
          baseTotal={baseTotal}
          subKey={`${dimension}:${value ?? ""}`}
        />

        <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-[2px] bg-primary/30" aria-hidden /> Selected group
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-[2px] bg-primary/10" aria-hidden /> All voters
          </span>
          <span className="ml-auto">Based on voters who chose to share demographics.</span>
        </div>
      </CardContent>
    </Card>
  );
}
