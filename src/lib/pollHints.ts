// Human-readable explanations for the poll-header badges (Anonymous / recurrence). Shared by
// the feed card and the detail view so both popups say the same thing.

import { shortDate } from "./format";
import type { Recurrence } from "./types";

export const ANONYMOUS_HINT =
  "Anonymous poll: your vote is counted but isn't included in any demographic breakdown, and you can't change your vote after casting.";

/** What each cadence means in plain words (no time-of-day cadence exists — daily is the finest). */
const CADENCE: Record<Recurrence, string> = {
  NONE: "A one-off poll.",
  DAILY: "Runs daily — a fresh edition opens every day and the count resets each day.",
  WEEKLY: "Runs weekly — a fresh edition opens every week and the count resets each week.",
  MONTHLY: "Runs monthly — a fresh edition opens every month and the count resets each month.",
  YEARLY: "Runs yearly — a fresh edition opens every year and the count resets each year.",
  MANUAL: "Recurring poll: the creator opens a new edition manually whenever they choose.",
};

/** Cadence explanation plus the active date range, when the poll carries start/end dates. */
export function recurrenceHint(recurrence: Recurrence, start?: string, end?: string): string {
  const base = CADENCE[recurrence] ?? "Recurring poll.";
  const from = shortDate(start);
  const to = shortDate(end);
  if (from && to) return `${base} Active ${from} – ${to}.`;
  if (from) return `${base} Started ${from}.`;
  if (to) return `${base} Runs until ${to}.`;
  return base;
}
