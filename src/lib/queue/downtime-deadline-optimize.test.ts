import { describe, expect, it } from "vitest";
import { optimizeDowntimeJobPlacements } from "./downtime-deadline-optimize";
import type { Assignment, Machine, QueueJob } from "./types";
import type { DowntimeMove } from "./downtime-redistribute";

const machines: Machine[] = [
  {
    id: "nk1",
    currentWidthMm: 100,
    dailyRatePieces: 240,
    changeoverMinutes: 30,
    piecesPerDay: 8000,
  },
  {
    id: "nk2",
    currentWidthMm: 65,
    dailyRatePieces: 240,
    changeoverMinutes: 30,
    piecesPerDay: 8000,
  },
  {
    id: "s2",
    currentWidthMm: 100,
    dailyRatePieces: 240,
    changeoverMinutes: 30,
    piecesPerDay: 8000,
  },
];

const machineCodeById = new Map([
  ["nk1", "NK1"],
  ["nk2", "NK2"],
  ["s2", "S2"],
]);

function job(id: string, widthMm: number, deadline = "2026-10-09"): QueueJob {
  return {
    id,
    tileWidthMm: widthMm,
    storisMm: 0,
    quantityPallets: 1,
    pieceCount: 500,
    deadline,
    cutType: "",
    proposalId: "p1",
  };
}

function assignment(
  jobId: string,
  machineId: string,
  widthMm: number,
  startIso: string,
  endIso: string,
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
    estimatedStart: new Date(startIso),
    estimatedEnd: new Date(endIso),
    pickCriterion: "width",
    pickStartHours: 0,
    otherMachineId: null,
    otherStartHours: null,
    priority: "P3",
  };
}

describe("optimizeDowntimeJobPlacements", () => {
  it("builds lane order for moved urgent job", () => {
    const jobs = [
      job("moved", 100, "2026-10-09"),
      job("blocker", 65, "2026-10-20"),
    ];
    const assignments = [
      assignment(
        "moved",
        "s2",
        100,
        "2026-10-06T08:00:00+03:00",
        "2026-10-16T17:00:00+03:00",
      ),
      assignment(
        "blocker",
        "s2",
        65,
        "2026-10-06T08:00:00+03:00",
        "2026-10-06T16:00:00+03:00",
      ),
    ];
    const downtimeMoves: DowntimeMove[] = [
      {
        jobId: "moved",
        fromMachineId: "nk1",
        toMachineId: "s2",
        fromMachineCode: "NK1",
        toMachineCode: "S2",
        jobWidthMm: 100,
        fromStart: "2026-10-06T08:00:00+03:00",
        toStart: "2026-10-06T08:00:00+03:00",
        reason: "",
      },
    ];

    const laneOrder = optimizeDowntimeJobPlacements({
      assignments,
      machines,
      jobs,
      movedJobIds: ["moved"],
      unavailableMachineIds: new Set(["nk1"]),
      inProgressJobIds: new Set(),
      machineCodeById,
      downtimeMoves,
    });

    expect(laneOrder.get("s2")).toContain("moved");
    expect(laneOrder.get("s2")?.indexOf("moved")).toBeLessThan(
      laneOrder.get("s2")?.indexOf("blocker") ?? Number.MAX_SAFE_INTEGER,
    );
  });
});
