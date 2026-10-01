import { describe, expect, it } from "vitest";
import {
  isTimestampInLockedWeek,
  lockedWeekAfterFriday,
  lockedWeekForPlanner,
  plannerFridayMidnight,
  vilniusDateIso,
  zonedTimeToUtc,
} from "./week";

describe("Friday 00:00 Vilnius week lock", () => {
  it("maps Friday 2026-10-02 00:00 Vilnius to Mon–Sun 10-05 … 10-11", () => {
    const friday = zonedTimeToUtc(2026, 10, 2, 0, 0);
    expect(vilniusDateIso(friday)).toBe("2026-10-02");
    expect(lockedWeekAfterFriday(friday)).toEqual({
      startIso: "2026-10-05",
      endIso: "2026-10-11",
    });
  });

  it("early Thursday run uses upcoming Friday and locks next week", () => {
    const thursday = zonedTimeToUtc(2026, 10, 1, 12, 0);
    const friday = plannerFridayMidnight(thursday);
    expect(vilniusDateIso(friday)).toBe("2026-10-02");
    expect(lockedWeekForPlanner(thursday)).toEqual({
      startIso: "2026-10-05",
      endIso: "2026-10-11",
    });
  });

  it("jobs inside the locked week are editable; later jobs are not", () => {
    const week = { startIso: "2026-10-05", endIso: "2026-10-11" };
    const inWeek = zonedTimeToUtc(2026, 10, 6, 8, 0);
    const later = zonedTimeToUtc(2026, 10, 13, 8, 0);

    expect(isTimestampInLockedWeek(inWeek, week)).toBe(true);
    expect(isTimestampInLockedWeek(later, week)).toBe(false);
    expect(isTimestampInLockedWeek(inWeek.toISOString(), week)).toBe(true);
  });
});
