import { describe, expect, it } from "vitest";
import { pickMachine, scheduleQueue, sortJobsForMachine } from "./schedule";
import type { Machine, QueueJob } from "./types";

function makeJob(
  id: string,
  tileWidthMm: number,
  deadline = "2026-10-15",
  proposalId = `proposal-${id}`,
  quantityPallets = 1,
): QueueJob {
  return {
    id,
    tileWidthMm,
    quantityPallets,
    deadline,
    cutType: "pjovimas",
    proposalId,
  };
}

function makeMachine(
  id: string,
  currentWidthMm: number,
  dailyRatePieces = 240,
  availableAtHours = 0,
) {
  return {
    id,
    currentWidthMm,
    dailyRatePieces,
    changeoverMinutes: 30,
    availableAtHours,
    assignedJobs: [] as QueueJob[],
  };
}

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
  it("sends 101 mm to KNEW when both idle (KNEW 100, KONV 14)", () => {
    const picked = pickMachine(
      [makeMachine("KONV", 14), makeMachine("KNEW", 100, 720)],
      101,
    );

    expect(picked.id).toBe("KNEW");
  });

  it("sends 10 mm to KONV when both idle (KNEW 100, KONV 14)", () => {
    const picked = pickMachine(
      [makeMachine("KONV", 14), makeMachine("KNEW", 100, 720)],
      10,
    );

    expect(picked.id).toBe("KONV");
  });

  it("picks empty KONV over a long KNEW queue for 101 mm", () => {
    const picked = pickMachine(
      [
        makeMachine("KONV", 14, 240, 0),
        makeMachine("KNEW", 100, 720, 48),
      ],
      101,
    );

    expect(picked.id).toBe("KONV");
  });
});

describe("scheduleQueue", () => {
  it("moves 101 mm to empty KONV when KNEW 100 mm already has a long queue", () => {
    const assignments = scheduleQueue(
      [plannerMachine("KONV", 14), plannerMachine("KNEW", 100, 720)],
      [
        makeJob("long", 100, "2026-10-01", "fill-knew", 200),
        makeJob("next", 101, "2026-10-20", "overflow"),
      ],
    );

    const byJob = Object.fromEntries(
      assignments.map((assignment) => [assignment.jobId, assignment.machineId]),
    );

    expect(byJob.long).toBe("KNEW");
    expect(byJob.next).toBe("KONV");
  });

  it("both idle: 101 mm to KNEW (100), 10 mm to KONV (14)", () => {
    const assignments = scheduleQueue(
      [plannerMachine("KONV", 14), plannerMachine("KNEW", 100, 720)],
      [
        makeJob("wide", 101, "2026-10-10"),
        makeJob("narrow", 10, "2026-10-11"),
      ],
    );

    const byJob = Object.fromEntries(
      assignments.map((assignment) => [assignment.jobId, assignment.machineId]),
    );

    expect(byJob).toEqual({ wide: "KNEW", narrow: "KONV" });
  });

  it("both idle: 100 mm job goes to KNEW (higher pal./d.)", () => {
    const assignments = scheduleQueue(
      [plannerMachine("KONV", 0), plannerMachine("KNEW", 0, 720)],
      [makeJob("hundred", 100)],
    );

    expect(assignments).toHaveLength(1);
    expect(assignments[0].machineId).toBe("KNEW");
  });

  it("orders a lane nearest-neighbor from the conveyor stored width", () => {
    const assignments = scheduleQueue(
      [plannerMachine("KONV", 100), plannerMachine("KNEW", 200, 720)],
      [
        makeJob("far", 10, "2026-10-10"),
        makeJob("exact", 100, "2026-10-11"),
        makeJob("near", 108, "2026-10-12"),
      ],
    );

    const konv = assignments
      .filter((assignment) => assignment.machineId === "KONV")
      .sort(
        (left, right) =>
          left.estimatedStart.getTime() - right.estimatedStart.getTime(),
      );

    expect(konv.map((assignment) => assignment.jobId)).toEqual([
      "exact",
      "near",
      "far",
    ]);
  });
});
