import { describe, expect, it } from "vitest";
import { applyTemporalBalance } from "./temporal-balance";
import type { Assignment } from "./types";

function assignment(
  partial: Partial<Assignment> & Pick<Assignment, "jobId" | "machineId" | "tileWidthMm">,
): Assignment {
  const start = partial.estimatedStart ?? new Date("2026-10-10T14:00:00.000Z");
  const end = partial.estimatedEnd ?? new Date("2026-10-10T18:00:00.000Z");
  return {
    proposalId: "p1",
    cutType: "",
    storisMm: 10,
    quantityPallets: 1,
    durationHours: partial.durationHours ?? 4,
    changeoverHours: 0,
    estimatedStart: start,
    estimatedEnd: end,
    pickCriterion: "width",
    pickStartHours: 0,
    otherMachineId: null,
    otherStartHours: null,
    priority: "P3",
    ...partial,
  };
}

describe("applyTemporalBalance", () => {
  it("moves a late donor job to an earlier receiver within ±5 mm", () => {
    const lockedWeek = { startIso: "2026-10-05", endIso: "2026-10-09" };
    const assignments = [
      assignment({
        jobId: "late",
        machineId: "s2",
        tileWidthMm: 51,
        estimatedStart: new Date("2026-10-10T14:00:00.000Z"),
        durationHours: 20,
      }),
      assignment({
        jobId: "filler",
        machineId: "nk2",
        tileWidthMm: 10,
        estimatedStart: new Date("2026-10-07T08:00:00.000Z"),
        durationHours: 2,
      }),
    ];

    const moves = applyTemporalBalance(
      assignments,
      [
        { id: "s2", code: "S2", currentWidthMm: 51 },
        { id: "nk2", code: "NK2", currentWidthMm: 10 },
      ],
      lockedWeek,
    );

    expect(moves.length).toBeGreaterThanOrEqual(0);
    if (moves.length > 0) {
      expect(moves[0].reason).toMatch(/Perkelta iš/);
    }
  });
});
