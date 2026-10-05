import { describe, expect, it } from "vitest";
import {
  addWorkDuration,
  durationHoursFromPlan,
  isDuringLunchBreak,
  isWithinWorkHours,
  snapToWorkStart,
  workHoursUntil,
  WORK_END_HOUR,
  WORK_HOURS_PER_DAY,
  WORK_START_HOUR,
} from "./work-hours";
import { zonedTimeToUtc } from "./week";
import { scheduleQueue } from "./schedule";
import type { Machine, QueueJob } from "./types";

function vilnius(year: number, month: number, day: number, hour = 0, minute = 0) {
  return zonedTimeToUtc(year, month, day, hour, minute);
}

describe("work-hours scheduling", () => {
  it("durationHoursFromPlan counts productive hours, not overnight wall-clock", () => {
    const start = vilnius(2026, 10, 5, 8, 0);
    const end = vilnius(2026, 10, 6, 12, 0);
    expect(durationHoursFromPlan(start, end)).toBe(12);
    expect((end.getTime() - start.getTime()) / 3600000).toBeGreaterThan(20);
  });

  it("snaps a before-08:00 start to 08:00", () => {
    const beforeOpen = vilnius(2026, 10, 5, 7, 30); // Monday
    const snapped = snapToWorkStart(beforeOpen);
    expect(isWithinWorkHours(snapped)).toBe(true);
    expect(snapped.getTime()).toBe(vilnius(2026, 10, 5, WORK_START_HOUR, 0).getTime());
  });

  it("snaps an after-17:00 start to next workday 08:00", () => {
    const afterClose = vilnius(2026, 10, 5, 18, 0); // Monday
    const snapped = snapToWorkStart(afterClose);
    expect(snapped.getTime()).toBe(vilnius(2026, 10, 6, WORK_START_HOUR, 0).getTime());
  });

  it("snaps lunch break to 13:00", () => {
    const lunch = vilnius(2026, 10, 5, 12, 30);
    expect(isDuringLunchBreak(lunch)).toBe(true);
    expect(isWithinWorkHours(lunch)).toBe(false);
    expect(snapToWorkStart(lunch).getTime()).toBe(vilnius(2026, 10, 5, 13, 0).getTime());
  });

  it("ends an 8 h job at 17:00 when starting at 08:00 (1 h lunch at 12:00)", () => {
    const start = vilnius(2026, 10, 5, 8, 0);
    const { end } = addWorkDuration(start, WORK_HOURS_PER_DAY);
    expect(end.getTime()).toBe(vilnius(2026, 10, 5, WORK_END_HOUR, 0).getTime());
  });

  it("continues overflow past 17:00 on the next workday at 08:00", () => {
    const start = vilnius(2026, 10, 5, 16, 0); // Monday 16:00
    const { start: jobStart, end } = addWorkDuration(start, 2);
    expect(jobStart.getTime()).toBe(start.getTime());
    expect(end.getTime()).toBe(vilnius(2026, 10, 6, 9, 0).getTime());
  });

  it("never schedules end after 17:00 on the same day", () => {
    const start = vilnius(2026, 10, 5, 8, 0);
    const { end } = addWorkDuration(start, 10);
    expect(end.getTime()).toBe(vilnius(2026, 10, 6, 10, 0).getTime());
  });

  it("skips weekends when continuing after Friday 17:00", () => {
    const fridayAfternoon = vilnius(2026, 10, 9, 16, 30); // Friday
    const { end } = addWorkDuration(fridayAfternoon, 1);
    expect(end.getTime()).toBe(vilnius(2026, 10, 12, 8, 30).getTime()); // Monday
  });

  it("counts work hours until Friday 17:00", () => {
    const wednesday = vilnius(2026, 10, 7, 12, 54);
    const fridayEnd = vilnius(2026, 10, 9, WORK_END_HOUR, 0);
    const hours = workHoursUntil(wednesday, fridayEnd);
    expect(hours).toBe(20);
  });
});

describe("scheduleQueue work hours", () => {
  function makeJob(id: string, pieceCount: number): QueueJob {
    return {
      id,
      tileWidthMm: 100,
      storisMm: 20,
      quantityPallets: 1,
      pieceCount,
      deadline: "2026-10-15",
      cutType: "pjovimas",
      proposalId: `p-${id}`,
    };
  }

  function makeMachine(): Machine {
    return {
      id: "NK1",
      currentWidthMm: 100,
      dailyRatePieces: 240,
      changeoverMinutes: 30,
      piecesPerDay: 2500,
    };
  }

  it("planned_start and planned_end stay within productive windows", () => {
    const referenceTime = vilnius(2026, 10, 5, 7, 0);
    const assignments = scheduleQueue(
      [makeMachine()],
      [makeJob("a", 5000), makeJob("b", 5000), makeJob("c", 5000)],
      { referenceTime },
    );

    for (const assignment of assignments) {
      expect(isWithinWorkHours(assignment.estimatedStart)).toBe(true);
      const startParts = assignment.estimatedStart.toLocaleString("en-US", {
        timeZone: "Europe/Vilnius",
        hour: "numeric",
        hour12: false,
      });
      const endHour = Number(
        assignment.estimatedEnd.toLocaleString("en-US", {
          timeZone: "Europe/Vilnius",
          hour: "numeric",
          hour12: false,
        }),
      );
      expect(Number(startParts)).toBeGreaterThanOrEqual(WORK_START_HOUR);
      expect(Number(startParts)).toBeLessThan(WORK_END_HOUR);
      expect(endHour).toBeLessThanOrEqual(WORK_END_HOUR);
      if (endHour === WORK_END_HOUR) {
        const endMinute = Number(
          assignment.estimatedEnd.toLocaleString("en-US", {
            timeZone: "Europe/Vilnius",
            minute: "numeric",
          }),
        );
        expect(endMinute).toBe(0);
      }
    }
  });

  it("serial jobs on one machine do not overlap and respect work windows", () => {
    const referenceTime = vilnius(2026, 10, 5, 16, 0);
    const assignments = scheduleQueue(
      [makeMachine()],
      [makeJob("first", 500), makeJob("second", 500)],
      { referenceTime },
    ).sort(
      (left, right) =>
        left.estimatedStart.getTime() - right.estimatedStart.getTime(),
    );

    expect(assignments).toHaveLength(2);
    expect(assignments[0].estimatedEnd.getTime()).toBeLessThanOrEqual(
      assignments[1].estimatedStart.getTime(),
    );
    expect(isWithinWorkHours(assignments[0].estimatedStart)).toBe(true);
    expect(isWithinWorkHours(assignments[1].estimatedStart)).toBe(true);
    expect(assignments[0].estimatedEnd.getTime()).toBe(
      vilnius(2026, 10, 6, 8, 36).getTime(),
    );
    expect(assignments[1].estimatedStart.getTime()).toBe(
      assignments[0].estimatedEnd.getTime(),
    );
  });
});
