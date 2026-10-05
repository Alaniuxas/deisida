import { describe, expect, it } from "vitest";
import { backfillIdleLanes } from "./backfill-idle-lanes";
import {
  compareWidthDeadlinePriority,
  widthStepBand,
} from "./width-priority";
import type { Assignment, Machine, QueueJob } from "./types";

const LOCKED_WEEK = { startIso: "2026-10-05", endIso: "2026-10-09" };

function machine(id: string, width: number): Machine {
  return {
    id,
    currentWidthMm: width,
    dailyRatePieces: 720,
    changeoverMinutes: 30,
  };
}

function job(id: string, width: number, deadline = "2026-10-20"): QueueJob {
  return {
    id,
    tileWidthMm: width,
    storisMm: 60,
    quantityPallets: 1,
    pieceCount: 2000,
    deadline,
    cutType: "",
    proposalId: "p1",
  };
}

function assignment(
  jobId: string,
  machineId: string,
  start: string,
  end: string,
  width: number,
  durationHours = 4,
): Assignment {
  const estimatedStart = new Date(start);
  const estimatedEnd = new Date(end);
  return {
    jobId,
    machineId,
    proposalId: "p1",
    cutType: "",
    tileWidthMm: width,
    storisMm: 60,
    quantityPallets: 1,
    durationHours,
    changeoverHours: 0,
    estimatedStart,
    estimatedEnd,
    pickCriterion: "width",
    pickStartHours: 0,
    otherMachineId: null,
    otherStartHours: null,
    priority: "P1",
  };
}

describe("width step bands", () => {
  it("treats >15 mm as allowed wide band, not forbidden", () => {
    expect(widthStepBand(10, 14)).toBe(0);
    expect(widthStepBand(10, 20)).toBe(1);
    expect(widthStepBand(10, 100)).toBe(2);
  });

  it("prefers urgent 100 mm over distant 40 mm", () => {
    const urgentHundred = {
      urgent: true,
      band: 2 as const,
      gap: 90,
      deadlineMs: new Date("2026-10-07").getTime(),
    };
    const laterForty = {
      urgent: false,
      band: 2 as const,
      gap: 30,
      deadlineMs: new Date("2026-10-30").getTime(),
    };
    expect(compareWidthDeadlinePriority(urgentHundred, laterForty)).toBeLessThan(0);
  });
});

describe("backfillIdleLanes", () => {
  it("pulls 6–15 mm leftover onto idle machine (last-resort band)", () => {
    const nk1 = machine("nk1", 14);
    const s4 = machine("s4", 20);
    const assignments = [
      assignment(
        "j1",
        "nk1",
        "2026-10-05T05:00:00.000Z",
        "2026-10-07T06:54:00.000Z",
        14,
      ),
      assignment(
        "j2",
        "s4",
        "2026-10-12T05:00:00.000Z",
        "2026-10-12T10:00:00.000Z",
        25,
        2,
      ),
    ];
    const jobs = [job("j1", 14), job("j2", 25)];

    const moves = backfillIdleLanes(assignments, [nk1, s4], jobs, LOCKED_WEEK);

    expect(moves).toHaveLength(1);
    expect(moves[0]?.jobId).toBe("j2");
    expect(moves[0]?.toMachineId).toBe("nk1");
  });

  it("pulls compatible next-week job from another machine", () => {
    const nk1 = machine("nk1", 14);
    const nk2 = machine("nk2", 10);
    const assignments = [
      assignment(
        "j1",
        "nk1",
        "2026-10-05T05:00:00.000Z",
        "2026-10-07T06:54:00.000Z",
        14,
      ),
      assignment(
        "j2",
        "nk2",
        "2026-10-12T05:00:00.000Z",
        "2026-10-12T12:00:00.000Z",
        14,
        2,
      ),
    ];
    const jobs = [job("j1", 14), job("j2", 14)];

    const moves = backfillIdleLanes(assignments, [nk1, nk2], jobs, LOCKED_WEEK);

    expect(moves).toHaveLength(1);
    expect(moves[0].jobId).toBe("j2");
    expect(moves[0].fromMachineId).toBe("nk2");
    expect(moves[0].toMachineId).toBe("nk1");
  });

  it("prefers leftover 40 mm over 100 mm when deadlines are equal", () => {
    const sk1 = machine("sk1", 10);
    const s4 = machine("s4", 40);
    const nk2 = machine("nk2", 100);
    const assignments = [
      assignment(
        "narrow",
        "sk1",
        "2026-10-05T05:00:00.000Z",
        "2026-10-06T11:19:00.000Z",
        20,
        8,
      ),
      assignment(
        "forty",
        "s4",
        "2026-10-12T05:00:00.000Z",
        "2026-10-12T10:00:00.000Z",
        40,
        4,
      ),
      assignment(
        "hundred",
        "nk2",
        "2026-10-12T05:00:00.000Z",
        "2026-10-13T10:00:00.000Z",
        100,
        8,
      ),
    ];

    const moves = backfillIdleLanes(
      assignments,
      [sk1, s4, nk2],
      [job("narrow", 20), job("forty", 40), job("hundred", 100)],
      LOCKED_WEEK,
    );

    expect(moves[0]?.jobId).toBe("forty");
    expect(moves[0]?.toMachineId).toBe("sk1");
  });

  it("pulls 100 mm onto idle SK1 when that is the only leftover", () => {
    const sk1 = machine("sk1", 10);
    const nk2 = machine("nk2", 100);
    const assignments = [
      assignment(
        "narrow",
        "sk1",
        "2026-10-05T05:00:00.000Z",
        "2026-10-06T11:19:00.000Z",
        20,
        8,
      ),
      assignment(
        "hundred",
        "nk2",
        "2026-10-12T05:00:00.000Z",
        "2026-10-13T10:00:00.000Z",
        100,
        4,
      ),
    ];

    const moves = backfillIdleLanes(
      assignments,
      [sk1, nk2],
      [job("narrow", 20), job("hundred", 100)],
      LOCKED_WEEK,
    );

    expect(moves.map((move) => move.jobId)).toEqual(["hundred"]);
    expect(moves[0]?.toMachineId).toBe("sk1");
  });

  it("pulls urgent 100 mm before non-urgent 40 mm", () => {
    const sk1 = machine("sk1", 10);
    const s4 = machine("s4", 40);
    const nk2 = machine("nk2", 100);
    const assignments = [
      assignment(
        "narrow",
        "sk1",
        "2026-10-05T05:00:00.000Z",
        "2026-10-06T11:19:00.000Z",
        20,
        8,
      ),
      assignment(
        "forty",
        "s4",
        "2026-10-12T05:00:00.000Z",
        "2026-10-12T10:00:00.000Z",
        40,
        4,
      ),
      assignment(
        "hundred",
        "nk2",
        "2026-10-12T05:00:00.000Z",
        "2026-10-13T10:00:00.000Z",
        100,
        4,
      ),
    ];

    const moves = backfillIdleLanes(
      assignments,
      [sk1, s4, nk2],
      [
        job("narrow", 20, "2026-10-20"),
        job("forty", 40, "2026-10-30"),
        job("hundred", 100, "2026-10-07"),
      ],
      LOCKED_WEEK,
    );

    expect(moves[0]?.jobId).toBe("hundred");
  });
});
