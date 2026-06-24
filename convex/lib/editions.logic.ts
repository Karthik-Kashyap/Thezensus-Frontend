// Compute-don't-roll edition engine (SCRATCH-007), ported verbatim from
// backend/shared/src/editions. There is NO scheduler flipping editions: the current
// edition label is a pure function of (recurrence, timezone, server clock), and the
// active window is a pure function of (recurrenceStart/End, that label). Both the poll
// read path and the vote write gate use this exact same math.

import { RECURRENCE, MAIN_EDITION, type Recurrence } from "./constants/poll";

/** Recurrences whose edition label is derived from the clock (vs. stored). */
const TIME_BASED: ReadonlySet<Recurrence> = new Set([
  RECURRENCE.DAILY,
  RECURRENCE.WEEKLY,
  RECURRENCE.MONTHLY,
  RECURRENCE.YEARLY,
]);

/** True when the label is computed from the clock rather than read from `currentEdition`. */
export function isTimeBased(recurrence: Recurrence): boolean {
  return TIME_BASED.has(recurrence);
}

/** The y/m/d of an instant as seen in a given IANA timezone (not the server's zone). */
function zonedYmd(at: Date, timezone: string): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

/**
 * ISO-8601 week label `YYYY-Www` for a calendar date. The week-year can differ from
 * the calendar year at the boundary (e.g. Dec 31 may belong to next year's W01). Uses a
 * UTC anchor so the arithmetic is timezone-free once y/m/d is fixed.
 */
function isoWeekLabel(year: number, month: number, day: number): string {
  const date = new Date(Date.UTC(year, month - 1, day));
  // ISO weekday: Mon=1..Sun=7. Shift to the Thursday of this week — its year is the
  // ISO week-year and its day-of-year gives the week number.
  const isoDow = date.getUTCDay() === 0 ? 7 : date.getUTCDay();
  date.setUTCDate(date.getUTCDate() + 4 - isoDow);
  const weekYear = date.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(weekYear, 0, 1));
  const firstDow = firstThursday.getUTCDay() === 0 ? 7 : firstThursday.getUTCDay();
  firstThursday.setUTCDate(firstThursday.getUTCDate() + 4 - firstDow);
  const week = 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 86_400_000));
  return `${weekYear}-W${pad(week)}`;
}

/**
 * The edition label for a poll at instant `at`. Time-based recurrences derive a label
 * snapped to their natural period in the poll's timezone; NONE/MANUAL have no clock
 * component and return the fixed `main` label (callers prefer the stored
 * `currentEdition` cache for MANUAL once a roll endpoint exists).
 */
export function computeEditionLabel(
  recurrence: Recurrence,
  timezone: string | undefined,
  at: Date = new Date(),
): string {
  if (!isTimeBased(recurrence)) return MAIN_EDITION;
  const zone = timezone ?? "UTC";
  const { year, month, day } = zonedYmd(at, zone);
  switch (recurrence) {
    case RECURRENCE.DAILY:
      return `${year}-${pad(month)}-${pad(day)}`;
    case RECURRENCE.WEEKLY:
      return isoWeekLabel(year, month, day);
    case RECURRENCE.MONTHLY:
      return `${year}-${pad(month)}`;
    case RECURRENCE.YEARLY:
      return `${year}`;
    default:
      return MAIN_EDITION;
  }
}

/** Tri-state of the recurrence window: before it starts, within it, or after it ends. */
export type WindowState = "PENDING" | "ACTIVE" | "ENDED";

/**
 * Where `label` sits relative to the optional [start, end] window (both inclusive).
 * Labels of the same granularity sort lexicographically in chronological order, so a
 * plain string compare is correct for every cadence (`YYYY-MM-DD`, `YYYY-Www`, …).
 */
export function windowState(
  label: string,
  recurrenceStart?: string,
  recurrenceEnd?: string,
): WindowState {
  if (recurrenceStart && label < recurrenceStart) return "PENDING";
  if (recurrenceEnd && label > recurrenceEnd) return "ENDED";
  return "ACTIVE";
}

/**
 * The label votes land on / readers see right now. MANUAL prefers the stored memo
 * (authoritative for non-time-based); time-based recurrences always recompute —
 * for those the memo is informational only.
 */
export function currentEditionLabel(poll: {
  recurrence: Recurrence;
  timezone?: string;
  currentEdition?: string;
}): string {
  if (!isTimeBased(poll.recurrence)) return poll.currentEdition ?? MAIN_EDITION;
  return computeEditionLabel(poll.recurrence, poll.timezone);
}

// ── Next-edition boundary (the "next poll in …" countdown target) ────────────

/** Calendar arithmetic on a UTC anchor — once y/m/d is fixed the date math is
 *  timezone-free (same trick isoWeekLabel uses); the zone re-enters only at midnight. */
function addCalendarDays(
  year: number,
  month: number,
  day: number,
  days: number,
): { year: number; month: number; day: number } {
  const dt = new Date(Date.UTC(year, month - 1, day));
  dt.setUTCDate(dt.getUTCDate() + days);
  return { year: dt.getUTCFullYear(), month: dt.getUTCMonth() + 1, day: dt.getUTCDate() };
}

/** Days from y/m/d to the next ISO Monday (1–7; never 0 — a fresh week always starts ahead). */
function daysToNextMonday(year: number, month: number, day: number): number {
  const dt = new Date(Date.UTC(year, month - 1, day));
  const isoDow = dt.getUTCDay() === 0 ? 7 : dt.getUTCDay();
  return 8 - isoDow;
}

/** UTC offset (ms) of `zone` at `instant`: the zone's wall-clock minus the same fields read as UTC. */
function zoneOffsetMs(zone: string, instant: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24, // neutralize any "24" midnight rendering
    get("minute"),
    get("second"),
  );
  return asUtc - instant.getTime();
}

/**
 * The UTC instant (ms) of local midnight on y/m/d in `zone`. Two-pass to settle DST: the
 * first pass guesses with the wall-clock-as-UTC offset, the second corrects if the zone's
 * offset differs at that candidate instant (a spring-forward / fall-back boundary).
 */
function zonedMidnightMs(year: number, month: number, day: number, zone: string): number {
  const wall = Date.UTC(year, month - 1, day, 0, 0, 0);
  const guess = wall - zoneOffsetMs(zone, new Date(wall));
  return wall - zoneOffsetMs(zone, new Date(guess));
}

/**
 * The instant (epoch ms) the *next* edition opens — the exclusive end of the current
 * edition's window — for a time-based recurrence in the poll's timezone. This is the exact
 * moment computeEditionLabel() rolls to the next label, i.e. what a "next poll in …"
 * countdown ticks down to. Returns undefined for NONE/MANUAL (no clock-driven rollover).
 */
export function nextEditionStart(
  recurrence: Recurrence,
  timezone: string | undefined,
  at: Date = new Date(),
): number | undefined {
  if (!isTimeBased(recurrence)) return undefined;
  const zone = timezone ?? "UTC";
  const { year, month, day } = zonedYmd(at, zone);
  let next: { year: number; month: number; day: number };
  switch (recurrence) {
    case RECURRENCE.DAILY:
      next = addCalendarDays(year, month, day, 1);
      break;
    case RECURRENCE.WEEKLY:
      next = addCalendarDays(year, month, day, daysToNextMonday(year, month, day));
      break;
    case RECURRENCE.MONTHLY:
      next = month === 12 ? { year: year + 1, month: 1, day: 1 } : { year, month: month + 1, day: 1 };
      break;
    case RECURRENCE.YEARLY:
      next = { year: year + 1, month: 1, day: 1 };
      break;
    default:
      return undefined;
  }
  return zonedMidnightMs(next.year, next.month, next.day, zone);
}
