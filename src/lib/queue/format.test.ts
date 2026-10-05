import { describe, expect, it } from "vitest";
import {
  effectiveCutByDeadline,
  formatDurationHours,
  formatScheduleEndpoints,
  isDeadlineStaleInPlan,
} from "./format";
import { WORK_HOURS_PER_DAY } from "./work-hours";

describe("formatDurationHours", () => {
  it("uses 8 h workdays, not 24 h calendar days", () => {
    expect(formatDurationHours(64)).toBe("8 d.");
    expect(formatDurationHours(56)).toBe("7 d.");
    expect(formatDurationHours(WORK_HOURS_PER_DAY)).toBe("1 d.");
    expect(formatDurationHours(WORK_HOURS_PER_DAY + 2)).toBe("1 d. 2 val.");
  });
});

describe("effectiveCutByDeadline", () => {
  const now = new Date("2026-10-05T10:00:00+03:00");

  it("bumps past deadlines to today", () => {
    expect(effectiveCutByDeadline("2026-10-01", null, now)).toBe("2026-10-05");
  });

  it("aligns deadline with planned finish when later", () => {
    expect(
      effectiveCutByDeadline(
        "2026-10-05",
        "2026-10-21T13:43:00+03:00",
        now,
      ),
    ).toBe("2026-10-21");
  });

  it("detects stale deadlines in plan", () => {
    expect(
      isDeadlineStaleInPlan(
        "2026-10-05",
        "2026-10-21T13:43:00+03:00",
        now,
      ),
    ).toBe(true);
  });
});

describe("formatScheduleEndpoints", () => {
  it("shows seconds for sub-minute jobs", () => {
    const start = "2026-10-07T12:34:00.000Z";
    const end = "2026-10-07T12:34:18.000Z";
    const formatted = formatScheduleEndpoints(start, end);
    expect(formatted.start).toMatch(/34/);
    expect(formatted.end).toMatch(/34/);
    expect(formatted.start).not.toBe(formatted.end);
  });
});
