import { describe, expect, it } from "vitest";
import { defaultDowntimeRange, vilniusNowParts } from "./vilnius-now";

describe("vilniusNowParts", () => {
  it("returns 24h time in Vilnius timezone", () => {
    const parts = vilniusNowParts(new Date("2026-10-05T06:30:00.000Z"));
    expect(parts.dateIso).toBe("2026-10-05");
    expect(parts.time).toMatch(/^\d{2}:\d{2}$/);
    expect(parts.hour).toBeGreaterThanOrEqual(0);
    expect(parts.hour).toBeLessThanOrEqual(23);
  });
});

describe("defaultDowntimeRange", () => {
  it("defaults start to now and end to 17:00 same day before evening", () => {
    const defaults = defaultDowntimeRange(new Date("2026-10-05T06:30:00.000Z"));
    expect(defaults.startDate).toBe("2026-10-05");
    expect(defaults.startTime).toBe("09:30");
    expect(defaults.endDate).toBe("2026-10-05");
    expect(defaults.endTime).toBe("17:00");
  });

  it("defaults end to next day 17:00 after work hours", () => {
    const defaults = defaultDowntimeRange(new Date("2026-10-05T15:30:00.000Z"));
    expect(defaults.startDate).toBe("2026-10-05");
    expect(defaults.endDate).toBe("2026-10-06");
    expect(defaults.endTime).toBe("17:00");
  });
});
