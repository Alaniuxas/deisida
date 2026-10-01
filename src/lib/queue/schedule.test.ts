import { describe, expect, it } from "vitest";
import { pickMachine, scheduleQueue, sortJobsForMachine } from "./schedule";
import type { Machine, QueueJob } from "./types";

function makeJob(
  id: string,
  tileWidthMm: number,
  deadline = "2026-10-15",
  proposalId = `proposal-${id}`,
  quantityPallets = 1,
  storisMm = 20,
  pieceCount = 100,
): QueueJob {
  return {
    id,
    tileWidthMm,
    storisMm,
    quantityPallets,
    pieceCount,
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
    piecesPerDay: dailyRatePieces === 720 ? 8000 : 2500,
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
    piecesPerDay: dailyRatePieces === 720 ? 8000 : 2500,
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

  it("keeps P1 same storis before P2 other storis at the same width", () => {
    const jobs = [
      makeJob("p2", 100, "2026-10-10", "p2", 1, 30),
      makeJob("p1", 100, "2026-10-20", "p1", 1, 20),
    ];

    const ordered = sortJobsForMachine(jobs, 100, 20);

    expect(ordered.map((job) => job.id)).toEqual(["p1", "p2"]);
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
  it("sends 101 mm to NK1 when both idle (NK1 100, SK1 14)", () => {
    const picked = pickMachine(
      [makeMachine("SK1", 14), makeMachine("NK1", 100, 720)],
      101,
    );

    expect(picked.id).toBe("NK1");
  });

  it("sends 10 mm to SK1 when both idle (NK1 100, SK1 14)", () => {
    const picked = pickMachine(
      [makeMachine("SK1", 14), makeMachine("NK1", 100, 720)],
      10,
    );

    expect(picked.id).toBe("SK1");
  });
});

describe("scheduleQueue P1/P2 clustering", () => {
  it("keeps 101 mm and 102 mm with the 100 mm machine; empty gets farthest", () => {
    const assignments = scheduleQueue(
      [plannerMachine("SK1", 0), plannerMachine("NK1", 100, 720)],
      [
        makeJob("w100", 100, "2026-10-01", "a", 2, 20, 200),
        makeJob("w101", 101, "2026-10-02", "b", 2, 20, 200),
        makeJob("w102", 102, "2026-10-03", "c", 2, 20, 200),
        makeJob("far", 10, "2026-10-04", "d", 2, 20, 200),
      ],
    );

    const byJob = Object.fromEntries(
      assignments.map((assignment) => [assignment.jobId, assignment.machineId]),
    );

    expect(byJob.w100).toBe("NK1");
    expect(byJob.w101).toBe("NK1");
    expect(byJob.w102).toBe("NK1");
    expect(byJob.far).toBe("SK1");
  });

  it("does not steal 101 mm onto an empty machine just because the 100 mm queue is long", () => {
    const assignments = scheduleQueue(
      [plannerMachine("SK1", 0), plannerMachine("NK1", 100, 720)],
      [
        makeJob("long", 100, "2026-10-01", "fill", 200, 20, 20000),
        makeJob("next", 101, "2026-10-20", "overflow", 1, 20, 100),
      ],
    );

    const byJob = Object.fromEntries(
      assignments.map((assignment) => [assignment.jobId, assignment.machineId]),
    );

    expect(byJob.long).toBe("NK1");
    expect(byJob.next).toBe("NK1");
  });

  it("both idle: 101 mm to higher-rate NK1, 10 mm to SK1 (farthest)", () => {
    const assignments = scheduleQueue(
      [plannerMachine("SK1", 0), plannerMachine("NK1", 0, 720)],
      [
        makeJob("wide", 101, "2026-10-10"),
        makeJob("narrow", 10, "2026-10-11"),
      ],
    );

    const byJob = Object.fromEntries(
      assignments.map((assignment) => [assignment.jobId, assignment.machineId]),
    );

    expect(byJob).toEqual({ wide: "NK1", narrow: "SK1" });
  });

  it("both idle: 100 mm job goes to NK1 (higher pal./d.)", () => {
    const assignments = scheduleQueue(
      [plannerMachine("SK1", 0), plannerMachine("NK1", 0, 720)],
      [makeJob("hundred", 100)],
    );

    expect(assignments).toHaveLength(1);
    expect(assignments[0].machineId).toBe("NK1");
  });

  it("orders a lane nearest-neighbor from the conveyor stored width", () => {
    const assignments = scheduleQueue(
      [plannerMachine("SK1", 100), plannerMachine("NK1", 200, 720)],
      [
        makeJob("far", 10, "2026-10-10"),
        makeJob("exact", 100, "2026-10-11"),
        makeJob("near", 108, "2026-10-12"),
      ],
    );

    const sk1 = assignments
      .filter((assignment) => assignment.machineId === "SK1")
      .sort(
        (left, right) =>
          left.estimatedStart.getTime() - right.estimatedStart.getTime(),
      );

    expect(sk1.map((assignment) => assignment.jobId)).toEqual([
      "exact",
      "near",
      "far",
    ]);
  });
});
