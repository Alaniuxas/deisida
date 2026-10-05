import { describe, expect, it } from "vitest";
import { resolvePinnedMachineId } from "./plan";

const machineCodeToId = new Map([
  ["NK1", "nk1-id"],
  ["NK2", "nk2-id"],
]);

function job(overrides: Partial<{
  status: string;
  machineId: string | null;
  completedPieces: number;
  pieceCount: number;
}> = {}) {
  return {
    status: "queued",
    machineId: null,
    completedPieces: 0,
    pieceCount: 1000,
    ...overrides,
  };
}

describe("resolvePinnedMachineId", () => {
  it("pins STRESS demo jobs to named machine", () => {
    expect(
      resolvePinnedMachineId({
        job: job(),
        proposalNumber: "STRESS-NK1-16-1",
        machineCodeToId,
      }),
    ).toBe("nk1-id");
  });

  it("pins in_progress jobs to their current machine", () => {
    expect(
      resolvePinnedMachineId({
        job: job({ status: "in_progress", machineId: "nk2-id" }),
        proposalNumber: "ORD-123",
        machineCodeToId,
      }),
    ).toBe("nk2-id");
  });

  it("pins unfinished locked-week jobs from accepted plan", () => {
    expect(
      resolvePinnedMachineId({
        job: job({ completedPieces: 200 }),
        proposalNumber: "ORD-456",
        machineCodeToId,
        previousPlanAccepted: true,
        previousPlanItem: { machineId: "nk1-id", lockedWeek: true },
      }),
    ).toBe("nk1-id");
  });

  it("does not pin finished jobs from accepted plan", () => {
    expect(
      resolvePinnedMachineId({
        job: job({ completedPieces: 1000 }),
        proposalNumber: "ORD-456",
        machineCodeToId,
        previousPlanAccepted: true,
        previousPlanItem: { machineId: "nk1-id", lockedWeek: true },
      }),
    ).toBeUndefined();
  });

  it("does not pin from unaccepted plan (allows rebalance before confirm)", () => {
    expect(
      resolvePinnedMachineId({
        job: job(),
        proposalNumber: "ORD-789",
        machineCodeToId,
        previousPlanAccepted: false,
        previousPlanItem: { machineId: "nk1-id", lockedWeek: true },
      }),
    ).toBeUndefined();
  });
});
