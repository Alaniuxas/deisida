import { describe, expect, it } from "vitest";
import { plannerReferenceTime } from "./balance";
import { scheduleQueue } from "./schedule";
import { lockedWeekForPlanner, zonedTimeToUtc } from "./week";
import type { Machine, QueueJob } from "./types";

const LOCKED_WEEK = { startIso: "2026-10-05", endIso: "2026-10-09" };

function plannerMachine(
  id: string,
  currentWidthMm: number,
  dailyRatePieces = 240,
): Machine {
  return {
    id,
    currentWidthMm,
    dailyRatePieces,
    changeoverMinutes: 30,
  };
}

function makeJob(id: string, tileWidthMm: number): QueueJob {
  return {
    id,
    tileWidthMm,
    storisMm: 10,
    quantityPallets: 1,
    pieceCount: 500,
    deadline: "2026-10-15",
    cutType: "",
    proposalId: "p1",
  };
}

describe("Friday evening plan (--as-of simulation)", () => {
  it("uses next Monday 08:00 as reference from Friday 20:00", () => {
    const fridayEvening = zonedTimeToUtc(2026, 10, 2, 20, 0);
    const lockedWeek = lockedWeekForPlanner(fridayEvening);
    expect(lockedWeek).toEqual(LOCKED_WEEK);

    const reference = plannerReferenceTime(fridayEvening, lockedWeek);
    const mondayLabel = reference.toLocaleString("en-GB", {
      timeZone: "Europe/Vilnius",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
    expect(mondayLabel).toMatch(/Mon/i);
    expect(mondayLabel).toMatch(/08:00/);
  });

  it("assigns w51 to S2@51, not NK1@14", () => {
    const fridayEvening = zonedTimeToUtc(2026, 10, 2, 20, 0);
    const lockedWeek = lockedWeekForPlanner(fridayEvening);
    const reference = plannerReferenceTime(fridayEvening, lockedWeek);

    const machines = [
      plannerMachine("NK1", 14, 720),
      plannerMachine("S2", 51, 240),
    ];
    const assignments = scheduleQueue(machines, [makeJob("w51", 51)], {
      referenceTime: reference,
      lockedWeek,
      balanceLockedWeek: true,
    });

    expect(assignments[0]?.machineId).toBe("S2");
    const startLabel = assignments[0].estimatedStart.toLocaleString("en-GB", {
      timeZone: "Europe/Vilnius",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
    expect(startLabel).toMatch(/Mon/i);
    expect(startLabel).toMatch(/08:00/);
  });
});
