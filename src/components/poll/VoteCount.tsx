import { Pointer } from "lucide-react";
import { compactNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * The vote tally shown across poll surfaces (feed card, detail header, vote panel): a count
 * followed by the vote symbol (a raised-finger hand). Defined once so the icon, spacing, and
 * a11y label stay identical everywhere — change the symbol here and every surface follows.
 * `format` defaults to the compact form (1.2k); pass `(n) => n.toLocaleString()` for the exact
 * count where there's room.
 */
export function VoteCount({
  count,
  format = compactNumber,
  className,
}: {
  count: number;
  format?: (n: number) => string;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      {format(count)}
      <Pointer className="h-3.5 w-3.5" aria-label="votes" />
    </span>
  );
}
