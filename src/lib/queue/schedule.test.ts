import { describe, expect, it } from "vitest";
import { pickMachine, sortJobsForMachine } from "./schedule";
import type { QueueJob } from "./types";

function makeJob(
  id: string,
  tileWidthMm: number,
  deadline = "2026-10-15",
): QueueJob {
  return {
    id,
    tileWidthMm,
    quantityPallets: 1,
    deadline,
    cutType: "pjovimas",
    proposalId: `proposal-${id}`,
  };
}

describe("sortJobsForMachine", () => {
  it("orders exact width first, then nearest-neighbor, not ascending width", () => {
    const jobs = [
      makeJob("exact", 100),
      makeJob("far", 10),
      makeJob("near", 108, "2026-10-20"),
    ];

    const ordered = sortJobsForMachine(jobs, 100);

    expect(ordered.map((job) => job.id)).toEqual(["exact", "near", "far"]);
  });

  it("uses deadline as tiebreaker for equal width deltas", () => {
    const jobs = [
      makeJob("later", 110, "2026-10-20"),
      makeJob("sooner", 90, "2026-10-10"),
    ];

    const ordered = sortJobsForMachine(jobs, 100);

    expect(ordered.map((job) => job.id)).toEqual(["sooner", "later"]);
  });
});

describe("pickMachine", () => {
  it("prefers smallest width delta when no exact match", () => {
    const machineStates = [
      {
        id: "KONV",
        currentWidthMm: 100,
        dailyRatePieces: 240,
        changeoverMinutes: 30,
        availableAtHours: 0,
        assignedJobs: [],
      },
      {
        id: "KNEW",
        currentWidthMm: 200,
        dailyRatePieces: 720,
        changeoverMinutes: 30,
        availableAtHours: 0,
        assignedJobs: [],
      },
    ];

    const picked = pickMachine(machineStates, 108, new Set(), false);

    expect(picked.id).toBe("KONV");
  });

  it("breaks width-delta ties by earliest availability", () => {
    const machineStates = [
      {
        id: "KONV",
        currentWidthMm: 100,
        dailyRatePieces: 240,
        changeoverMinutes: 30,
        availableAtHours: 5,
        assignedJobs: [],
      },
      {
        id: "KNEW",
        currentWidthMm: 116,
        dailyRatePieces: 720,
        changeoverMinutes: 30,
        availableAtHours: 1,
        assignedJobs: [],
      },
    ];

    const picked = pickMachine(machineStates, 108, new Set(), false);

    expect(picked.id).toBe("KNEW");
  });
});
