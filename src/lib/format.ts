// Small presentation helpers shared across components.

import type { Recurrence } from "./types";

/** Up-to-two-letter initials for an avatar fallback. Works on a cosmos handle
 *  (`Pulsar-4821` → "PU") by taking the leading letters of the word before the `-`. */
export function initials(name?: string | null): string {
  if (!name) return "?";
  const word = name.trim().split(/[\s-]+/)[0] ?? "";
  const letters = word.replace(/[^a-zA-Z]/g, "");
  return letters.slice(0, 2).toUpperCase() || "?";
}

/** Compact relative time, e.g. "3m", "5h", "2d", or a date for older items. */
export function relativeTime(iso?: string): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString();
}

/** Absolute local date + time, e.g. "May 31, 2026, 4:05 PM" — for audit logs / precise stamps. */
export function dateTime(iso?: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/** Absolute local date, e.g. "Jun 15, 2026" — null for empty/invalid input. */
export function shortDate(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { dateStyle: "medium" });
}

/**
 * A remaining-time span → compact countdown that ticks to the second, e.g.
 * "2d 3h 4m", "4h 36m 12s", "36m 12s", "12s". Seconds are dropped only at the
 * day scale (pointless precision); clamps to "now" at/under zero.
 */
export function formatCountdown(ms: number): string {
  if (ms <= 0) return "now";
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86_400);
  const hours = Math.floor((totalSec % 86_400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m ${secs}s`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

/**
 * A raw edition label → a friendly, cadence-aware name for the history picker:
 *   DAILY    "2026-06-22"       → "Jun 22, 2026"
 *   WEEKLY   "2026-W25"         → "Week 25, 2026"
 *   MONTHLY  "2026-06"          → "June 2026"
 *   YEARLY   "2026"             → "2026"
 *   INTERVAL "2026-06-22T15:30" → "Jun 22, 2026, 3:30 PM"
 *   NONE/MANUAL "main"          → "Current"
 * Falls back to the raw label if it doesn't match the expected shape.
 */
export function formatEditionLabel(recurrence: Recurrence, label: string): string {
  if (recurrence === "INTERVAL") {
    // Labels are local wall-clock slot starts (`YYYY-MM-DDThh:mm`); parse as local time.
    const d = new Date(label);
    return Number.isNaN(d.getTime())
      ? label
      : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  }
  if (recurrence === "DAILY") {
    const d = new Date(`${label}T00:00:00`);
    return Number.isNaN(d.getTime()) ? label : d.toLocaleDateString(undefined, { dateStyle: "medium" });
  }
  if (recurrence === "WEEKLY") {
    const m = /^(\d{4})-W(\d{2})$/.exec(label);
    return m ? `Week ${Number(m[2])}, ${m[1]}` : label;
  }
  if (recurrence === "MONTHLY") {
    const m = /^(\d{4})-(\d{2})$/.exec(label);
    if (!m) return label;
    return new Date(Number(m[1]), Number(m[2]) - 1, 1).toLocaleDateString(undefined, {
      month: "long",
      year: "numeric",
    });
  }
  if (recurrence === "YEARLY") return label;
  return label === "main" ? "Current" : label;
}

/** A poll's cadence as a short human phrase for the recurrence badge:
 *  DAILY → "daily", INTERVAL+15 → "every 15 min", INTERVAL+120 → "every 2 hr". */
export function cadenceLabel(recurrence: Recurrence, intervalMinutes?: number): string {
  if (recurrence === "INTERVAL" && intervalMinutes) {
    return intervalMinutes < 60
      ? `every ${intervalMinutes} min`
      : `every ${intervalMinutes / 60} hr`;
  }
  return recurrence.toLowerCase();
}

/** Vote count → "1.2k" style compaction. */
export function compactNumber(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}
