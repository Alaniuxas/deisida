import { describe, expect, it } from "vitest";
import {
  buildDowntimeWindows,
  redistributeQueuedFromUnavailableMachines,
  shouldMoveJobForDowntime,
} from "./downtime-redistribute";
import type { Assignment, Machine, QueueJob } from "./types";

const machines: Machine[] = [
  { id: "nk1", currentWidthMm: 14, dailyRatePieces: 240, changeoverMinutes: 30 },
  { id: "nk2", currentWidthMm: 10, dailyRatePieces: 240, changeoverMinutes: 30 },
  { id: "s2", currentWidthMm: 51, dailyRatePieces: 240, changeoverMinutes: 30 },
];

const machineCodeById = new Map([
  ["nk1", "NK1"],
  ["nk2", "NK2"],
  ["s2", "S2"],
]);

const downtimeWindows = buildDowntimeWindows([
  {
    machineId: "nk1",
    startAt: "2026-10-05T06:00:00.000Z",
    endAt: "2026-10-08T14:00:00.000Z",
  },
]);

function job(id: string, widthMm: number): QueueJob {
  return {
    id,
    tileWidthMm: widthMm,
    storisMm: 0,
    quantityPallets: 1,
    pieceCount: 500,
    deadline: "2026-10-08",
    cutType: "",
    proposalId: "p1",
  };
}

function assignment(
  jobId: string,
  machineId: string,
  widthMm: number,
  plannedStart: string,
): Assignment {
  return {
    jobId,
    machineId,
    proposalId: "p1",
    cutType: "",
    tileWidthMm: widthMm,
    storisMm: 0,
    quantityPallets: 1,
    durationHours: 4,
    changeoverHours: 0,
    estimatedStart: new Date(plannedStart),
    estimatedEnd: new Date("2026-10-05T09:00:00.000Z"),
    pickCriterion: "width",
    pickStartHours: 0,
    otherMachineId: null,
    otherStartHours: null,
    priority: "P3",
  };
}

describe("shouldMoveJobForDowntime", () => {
  it("keeps jobs planned after downtime end", () => {
    const row = assignment("later", "nk1", 14, "2026-10-09T05:00:00.000Z");
    const window = downtimeWindows.get("nk1")!;
    expect(shouldMoveJobForDowntime(row, window, false)).toBe(false);
  });

  it("moves jobs planned before downtime end", () => {
    const row = assignment("soon", "nk1", 14, "2026-10-05T05:00:00.000Z");
    const window = downtimeWindows.get("nk1")!;
    expect(shouldMoveJobForDowntime(row, window, false)).toBe(true);
  });
});

describe("redistributeQueuedFromUnavailableMachines", () => {
  it("moves only jobs before repair end off a down machine", () => {
    const jobs = [job("soon", 14), job("later", 14)];
    const assignments = [
      assignment("soon", "nk1", 14, "2026-10-05T05:00:00.000Z"),
      assignment("later", "nk1", 14, "2026-10-09T05:00:00.000Z"),
    ];

    const { moved } = redistributeQueuedFromUnavailableMachines(
      assignments,
      machines,
      jobs,
      downtimeWindows,
      new Set(),
      machineCodeById,
    );

    expect(moved).toBe(1);
    expect(assignments.find((row) => row.jobId === "soon")?.machineId).toBe("nk2");
    expect(assignments.find((row) => row.jobId === "later")?.machineId).toBe("nk1");
  });

  it("keeps in_progress jobs on the down machine", () => {
    const jobs = [job("busy", 14), job("wait", 14)];
    const assignments = [
      assignment("busy", "nk1", 14, "2026-10-05T05:00:00.000Z"),
      assignment("wait", "nk1", 14, "2026-10-05T06:00:00.000Z"),
    ];

    const { moved } = redistributeQueuedFromUnavailableMachines(
      assignments,
      machines,
      jobs,
      downtimeWindows,
      new Set(["busy"]),
      machineCodeById,
    );

    expect(moved).toBe(1);
    expect(assignments.find((row) => row.jobId === "busy")?.machineId).toBe("nk1");
    expect(assignments.find((row) => row.jobId === "wait")?.machineId).toBe("nk2");
  });

  it("skips excluded jobs during downtime redistribution", () => {
    const jobs = [job("manual", 14), job("auto", 14)];
    const assignments = [
      assignment("manual", "nk1", 14, "2026-10-05T05:00:00.000Z"),
      assignment("auto", "nk1", 14, "2026-10-05T06:00:00.000Z"),
    ];

    const { moved } = redistributeQueuedFromUnavailableMachines(
      assignments,
      machines,
      jobs,
      downtimeWindows,
      new Set(),
      machineCodeById,
      new Set(["manual"]),
    );

    expect(moved).toBe(1);
    expect(assignments.find((row) => row.jobId === "manual")?.machineId).toBe("nk1");
    expect(assignments.find((row) => row.jobId === "auto")?.machineId).toBe("nk2");
  });
});
