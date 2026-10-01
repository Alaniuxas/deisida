import { describe, expect, it } from "vitest";
import { pickMachine, scheduleQueue, sortJobsForMachine } from "./schedule";
import type { Machine, QueueJob } from "./types";

function makeJob(
  id: string,
  tileWidthMm: number,
  deadline = "2026-10-15",
  proposalId = `proposal-${id}`,
): QueueJob {
  return {
    id,
    tileWidthMm,
    quantityPallets: 1,
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
  it("prefers exact current-width match over a closer leftover conveyor", () => {
    const picked = pickMachine(
      [makeMachine("KONV", 14), makeMachine("KNEW", 100, 720)],
      100,
    );

    expect(picked.id).toBe("KNEW");
  });

  it("prefers smallest width delta when no exact match", () => {
    const picked = pickMachine(
      [makeMachine("KONV", 100), makeMachine("KNEW", 200, 720)],
      108,
    );

    expect(picked.id).toBe("KONV");
  });

  it("breaks width-delta ties by earliest availability", () => {
    const picked = pickMachine(
      [
        makeMachine("KONV", 100, 240, 5),
        makeMachine("KNEW", 116, 720, 1),
      ],
      108,
    );

    expect(picked.id).toBe("KNEW");
  });
});

describe("scheduleQueue", () => {
  it("puts every exact-width job on the conveyor set to that width", () => {
    const assignments = scheduleQueue(
      [plannerMachine("KONV", 14), plannerMachine("KNEW", 100, 720)],
      [
        makeJob("a", 100, "2026-10-10", "order-a"),
        makeJob("b", 100, "2026-10-20", "order-b"),
        makeJob("c", 10, "2026-10-12", "order-c"),
      ],
    );

    const byJob = Object.fromEntries(
      assignments.map((assignment) => [assignment.jobId, assignment.machineId]),
    );

    expect(byJob).toMatchObject({ a: "KNEW", b: "KNEW", c: "KONV" });
  });

  it("keeps a dual-width order on the closer conveyors (KONV=14, KNEW=100)", () => {
    const assignments = scheduleQueue(
      [plannerMachine("KONV", 14), plannerMachine("KNEW", 100, 720)],
      [
        makeJob("ten", 10, "2026-10-15", "dual"),
        makeJob("wide", 115, "2026-10-15", "dual"),
        makeJob("exact", 100, "2026-10-16", "other"),
      ],
    );

    const byJob = Object.fromEntries(
      assignments.map((assignment) => [assignment.jobId, assignment.machineId]),
    );

    expect(byJob).toEqual({ ten: "KONV", wide: "KNEW", exact: "KNEW" });
  });

  it("can keep both widths of one order on the same closer conveyor", () => {
    const assignments = scheduleQueue(
      [plannerMachine("KONV", 14), plannerMachine("KNEW", 100, 720)],
      [
        makeJob("near-a", 12, "2026-10-15", "same-order"),
        makeJob("near-b", 16, "2026-10-15", "same-order"),
      ],
    );

    expect(assignments.map((assignment) => assignment.machineId)).toEqual([
      "KONV",
      "KONV",
    ]);
  });

  it("orders a lane nearest-neighbor from the conveyor current width", () => {
    const assignments = scheduleQueue(
      [plannerMachine("KONV", 100), plannerMachine("KNEW", 200, 720)],
      [
        makeJob("far", 10),
        makeJob("exact", 100),
        makeJob("near", 108, "2026-10-20"),
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
