import { describe, it, expect } from "vitest";
import {
  computeEditionLabel,
  nextEditionStart,
  windowState,
  isTimeBased,
  addEditions,
  cappedEnd,
} from "./editions.logic";
import { RECURRENCE, MAX_EDITIONS } from "./constants/poll";

// Build an instant from UTC wall-clock fields (month is 1-based here for readability).
const utc = (y: number, mo: number, d: number, h = 0, mi = 0) =>
  new Date(Date.UTC(y, mo - 1, d, h, mi, 0));

const label = (interval: number, at: Date, tz = "UTC") =>
  computeEditionLabel(RECURRENCE.INTERVAL, tz, interval, at);

describe("computeEditionLabel — INTERVAL snaps to clean clock marks (UTC)", () => {
  it("15m floors onto :00/:15/:30/:45", () => {
    expect(label(15, utc(2026, 6, 27, 14, 7))).toBe("2026-06-27T14:00");
    expect(label(15, utc(2026, 6, 27, 14, 14))).toBe("2026-06-27T14:00");
    expect(label(15, utc(2026, 6, 27, 14, 15))).toBe("2026-06-27T14:15");
    expect(label(15, utc(2026, 6, 27, 14, 59))).toBe("2026-06-27T14:45");
  });

  it("10m / 12m / 30m floors", () => {
    expect(label(10, utc(2026, 6, 27, 14, 7))).toBe("2026-06-27T14:00");
    expect(label(10, utc(2026, 6, 27, 14, 17))).toBe("2026-06-27T14:10");
    expect(label(12, utc(2026, 6, 27, 14, 25))).toBe("2026-06-27T14:24");
    expect(label(30, utc(2026, 6, 27, 14, 45))).toBe("2026-06-27T14:30");
  });

  it("hour cadences align to local midnight", () => {
    expect(label(60, utc(2026, 6, 27, 14, 59))).toBe("2026-06-27T14:00");
    expect(label(120, utc(2026, 6, 27, 15, 5))).toBe("2026-06-27T14:00"); // 2h marks: …14:00,16:00
    expect(label(480, utc(2026, 6, 27, 9, 0))).toBe("2026-06-27T08:00"); // 8h marks: 00,08,16
    expect(label(720, utc(2026, 6, 27, 13, 0))).toBe("2026-06-27T12:00"); // 12h marks: 00,12
  });
});

describe("computeEditionLabel — INTERVAL is timezone-aware", () => {
  it("snaps in the poll's local wall clock, not UTC", () => {
    // 14:07Z is 10:07 in New York (EDT, UTC-4 in June).
    expect(label(15, utc(2026, 6, 27, 14, 7), "America/New_York")).toBe("2026-06-27T10:00");
    // 14:07Z is 19:37 in Kolkata (UTC+5:30).
    expect(label(30, utc(2026, 6, 27, 14, 7), "Asia/Kolkata")).toBe("2026-06-27T19:30");
  });

  it("rolls the local DATE when the zone is ahead of UTC", () => {
    // 19:00Z is 00:30 the NEXT day in Kolkata.
    expect(label(15, utc(2026, 6, 27, 19, 0), "Asia/Kolkata")).toBe("2026-06-28T00:30");
  });
});

describe("nextEditionStart — the countdown target (UTC, exact epoch)", () => {
  it("points at the next clean mark", () => {
    expect(nextEditionStart(RECURRENCE.INTERVAL, "UTC", 15, utc(2026, 6, 27, 14, 7))).toBe(
      Date.UTC(2026, 5, 27, 14, 15, 0),
    );
    expect(nextEditionStart(RECURRENCE.INTERVAL, "UTC", 480, utc(2026, 6, 27, 9, 0))).toBe(
      Date.UTC(2026, 5, 27, 16, 0, 0),
    );
  });

  it("crosses into 00:00 of the next local day at the day's last slot", () => {
    expect(nextEditionStart(RECURRENCE.INTERVAL, "UTC", 15, utc(2026, 6, 27, 23, 50))).toBe(
      Date.UTC(2026, 5, 28, 0, 0, 0),
    );
  });

  it("is undefined for non-time-based cadences", () => {
    expect(nextEditionStart(RECURRENCE.NONE, "UTC", undefined, utc(2026, 6, 27))).toBeUndefined();
  });
});

describe("regression — calendar cadences unchanged", () => {
  it("DAILY/MONTHLY/YEARLY/WEEKLY/NONE", () => {
    const at = utc(2026, 6, 27, 14, 0);
    expect(computeEditionLabel(RECURRENCE.DAILY, "UTC", undefined, at)).toBe("2026-06-27");
    expect(computeEditionLabel(RECURRENCE.MONTHLY, "UTC", undefined, at)).toBe("2026-06");
    expect(computeEditionLabel(RECURRENCE.YEARLY, "UTC", undefined, at)).toBe("2026");
    expect(computeEditionLabel(RECURRENCE.WEEKLY, "UTC", undefined, at)).toMatch(/^2026-W\d{2}$/);
    expect(computeEditionLabel(RECURRENCE.NONE, "UTC", undefined, at)).toBe("main");
  });
});

describe("windowState — inclusive end closes the poll", () => {
  it("ACTIVE up to and including recurrenceEnd, ENDED past it", () => {
    expect(windowState("2026-06-28T04:45", undefined, "2026-06-28T04:45")).toBe("ACTIVE");
    expect(windowState("2026-06-28T05:00", undefined, "2026-06-28T04:45")).toBe("ENDED");
  });
  it("PENDING before recurrenceStart", () => {
    expect(windowState("2026-06-27T13:45", "2026-06-27T14:00", undefined)).toBe("PENDING");
  });
});

describe("addEditions — advance N periods", () => {
  it("INTERVAL: k=0 is the current slot; k=1 is +interval", () => {
    expect(addEditions(RECURRENCE.INTERVAL, "UTC", 15, utc(2026, 6, 27, 14, 3), 0)).toBe(
      "2026-06-27T14:00",
    );
    expect(addEditions(RECURRENCE.INTERVAL, "UTC", 15, utc(2026, 6, 27, 14, 3), 1)).toBe(
      "2026-06-27T14:15",
    );
  });
  it("DAILY: k days later", () => {
    expect(addEditions(RECURRENCE.DAILY, "UTC", undefined, utc(2026, 6, 27), 1)).toBe("2026-06-28");
  });
});

describe("cappedEnd — the 60-edition wall as a concrete recurrenceEnd", () => {
  it("INTERVAL 15m → 60th slot = first slot + 59 intervals (15h later)", () => {
    expect(cappedEnd(RECURRENCE.INTERVAL, "UTC", 15, utc(2026, 6, 27, 14, 3), MAX_EDITIONS)).toBe(
      "2026-06-28T04:45",
    );
  });
  it("DAILY → 60 days, MONTHLY → 60 months, YEARLY → 60 years", () => {
    expect(cappedEnd(RECURRENCE.DAILY, "UTC", undefined, utc(2026, 6, 27), 60)).toBe("2026-08-25");
    expect(cappedEnd(RECURRENCE.MONTHLY, "UTC", undefined, utc(2026, 6, 15), 60)).toBe("2031-05");
    expect(cappedEnd(RECURRENCE.YEARLY, "UTC", undefined, utc(2026, 6, 15), 60)).toBe("2085");
  });
  it("returns the EARLIER of the cap and a creator-supplied end", () => {
    expect(cappedEnd(RECURRENCE.DAILY, "UTC", undefined, utc(2026, 6, 27), 60, "2026-07-01")).toBe(
      "2026-07-01",
    );
    expect(cappedEnd(RECURRENCE.DAILY, "UTC", undefined, utc(2026, 6, 27), 60, "2027-01-01")).toBe(
      "2026-08-25",
    );
  });
  it("leaves non-time-based cadences to their (absent) user end", () => {
    expect(cappedEnd(RECURRENCE.NONE, "UTC", undefined, utc(2026, 6, 27), 60)).toBeUndefined();
  });
});

describe("isTimeBased", () => {
  it("INTERVAL and the calendar cadences are clock-driven; NONE/MANUAL are not", () => {
    expect(isTimeBased(RECURRENCE.INTERVAL)).toBe(true);
    expect(isTimeBased(RECURRENCE.DAILY)).toBe(true);
    expect(isTimeBased(RECURRENCE.NONE)).toBe(false);
    expect(isTimeBased(RECURRENCE.MANUAL)).toBe(false);
  });
});

describe("end-to-end — a 15-minute poll runs exactly MAX_EDITIONS editions", () => {
  it("walking the boundary from the first slot lands on the cap as edition #60", () => {
    const tz = "UTC";
    const created = utc(2026, 6, 27, 14, 3);
    const end = cappedEnd(RECURRENCE.INTERVAL, tz, 15, created, MAX_EDITIONS)!;

    let count = 1; // the first slot
    let at = utc(2026, 6, 27, 14, 0); // first slot start
    // Advance until the next edition would fall past the stamped end.
    for (let i = 0; i < 1000; i++) {
      const nextAt = nextEditionStart(RECURRENCE.INTERVAL, tz, 15, at)!;
      const nextLabel = computeEditionLabel(RECURRENCE.INTERVAL, tz, 15, new Date(nextAt));
      if (windowState(nextLabel, undefined, end) === "ENDED") break;
      count++;
      at = new Date(nextAt);
    }
    expect(count).toBe(MAX_EDITIONS);
  });
});
