import { describe, expect, it } from "vitest";
import {
  assignJobsWithLoadBalance,
  estimateJobHours,
  rebalanceMachineLoads,
  type BalancedMachineState,
} from "./balance";
import type { QueueJob } from "./types";

function lane(id: string, width: number): BalancedMachineState {
  return {
    id,
    currentWidthMm: width,
    dailyRatePieces: 720,
    changeoverMinutes: 30,
    piecesPerDay: 8000,
    plannedWidthMm: width,
    assignedJobs: [],
  };
}

function makeJob(id: string, width: number, pieces: number): QueueJob {
  return {
    id,
    tileWidthMm: width,
    storisMm: 40,
    quantityPallets: 1,
    pieceCount: pieces,
    deadline: "2026-10-10",
    cutType: "",
    proposalId: "p1",
  };
}

describe("estimateJobHours", () => {
  it("adds changeover only when sequential setup differs by more than ±5 mm", () => {
    const nk1 = lane("NK1", 14);
    const near = makeJob("near", 10, 8000);
    const far = makeJob("far", 30, 8000);
    expect(estimateJobHours(near, nk1, 14)).toBe(8);
    expect(estimateJobHours(far, nk1, 14)).toBe(8.5);
    expect(estimateJobHours(far, nk1, 30)).toBe(8);
  });
});

describe("rebalanceMachineLoads", () => {
  it("pulls w10 work onto idle NK1 from loaded NK2", () => {
    const states = [lane("NK1", 14), lane("NK2", 10)];
    states[1].assignedJobs = [
      makeJob("t1", 10, 1800),
      makeJob("t2", 10, 1800),
      makeJob("t3", 10, 1800),
      makeJob("t4", 10, 1800),
    ];
    states[0].assignedJobs = [makeJob("n1", 14, 400)];

    rebalanceMachineLoads(states);

    expect(states[0].assignedJobs.some((job) => job.tileWidthMm === 10)).toBe(true);
    expect(states[1].assignedJobs.length).toBeLessThan(4);
  });
});

describe("assignJobsWithLoadBalance", () => {
  it("spreads w10 jobs across NK1 and NK2 by load", () => {
    const states = [lane("NK1", 14), lane("NK2", 10)];
    const jobs = [
      makeJob("a", 10, 1800),
      makeJob("b", 10, 1800),
      makeJob("c", 10, 1800),
      makeJob("d", 10, 1800),
    ];

    assignJobsWithLoadBalance(states, jobs, new Map());
    rebalanceMachineLoads(states);

    const nk1w10 = states[0].assignedJobs.filter((job) => job.tileWidthMm === 10).length;
    const nk2w10 = states[1].assignedJobs.filter((job) => job.tileWidthMm === 10).length;
    expect(nk1w10).toBeGreaterThan(0);
    expect(nk2w10).toBeGreaterThan(0);
  });

  it("assigns 108 mm onto 100 mm lane with changeover; 51 mm still goes to the only machine", () => {
    const near = [lane("NK1", 100)];
    assignJobsWithLoadBalance(near, [makeJob("near", 108, 800)], new Map());
    expect(near[0].assignedJobs.map((job) => job.id)).toEqual(["near"]);

    const far = [lane("NK1", 14)];
    assignJobsWithLoadBalance(far, [makeJob("far", 51, 800)], new Map());
    expect(far[0].assignedJobs.map((job) => job.id)).toEqual(["far"]);
  });

  it("keeps pinned in-progress jobs on their machine even outside ±5 mm", () => {
    const states = [lane("NK1", 100), lane("S2", 50)];
    const pinned: QueueJob = {
      ...makeJob("pin", 115, 800),
      pinnedMachineId: "NK1",
    };
    assignJobsWithLoadBalance(states, [pinned], new Map());
    expect(states[0].assignedJobs.map((job) => job.id)).toEqual(["pin"]);
    expect(states[1].assignedJobs).toEqual([]);
  });
});
