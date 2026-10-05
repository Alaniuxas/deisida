import { describe, expect, it } from "vitest";
import {
  isJobEligibleForMachine,
  pickBestMachineForJob,
  pickChangeoverFallbackMachine,
  pickNearestMachineByStep,
  scoreMachineForJob,
} from "./assign-job";
import type { AssignableMachine } from "./assign-job";
import type { QueueJob } from "./types";

function machine(
  id: string,
  width: number,
  loadHours = 0,
): AssignableMachine {
  return {
    id,
    currentWidthMm: width,
    dailyRatePieces: 240,
    changeoverMinutes: 30,
    assignedJobs: [],
    loadHours,
  };
}

function job(width: number): QueueJob {
  return {
    id: `job-${width}`,
    tileWidthMm: width,
    storisMm: 50,
    quantityPallets: 1,
    pieceCount: 1000,
    deadline: "2026-10-10",
    cutType: "",
    proposalId: "p1",
  };
}

describe("assign-job", () => {
  it("prefers exact width match when loads are equal (S2@51 for w51)", () => {
    const machines = [machine("NK1", 14), machine("S1", 50), machine("S2", 51)];
    const best = pickBestMachineForJob(machines, job(51));
    expect(best?.id).toBe("S2");
  });

  it("prefers underloaded machine over exact match when loads differ", () => {
    const machines = [machine("NK1", 14, 0), machine("NK2", 10, 40)];
    const best = pickBestMachineForJob(machines, job(10));
    expect(best?.id).toBe("NK1");
  });

  it("allows S1@50 for w51 within tolerance", () => {
    expect(isJobEligibleForMachine(machine("S1", 50), job(51))).toBe(true);
    expect(scoreMachineForJob(machine("S2", 51), job(51))).toBeLessThan(
      scoreMachineForJob(machine("S1", 50), job(51)),
    );
  });

  it("rejects NK1@14 for w51", () => {
    expect(isJobEligibleForMachine(machine("NK1", 14), job(51))).toBe(false);
    expect(pickBestMachineForJob([machine("NK1", 14)], job(51))).toBeNull();
  });

  it("falls back to nearest magnet within 15 mm when no ±5 home exists", () => {
    const nk1 = machine("NK1", 100);
    expect(pickChangeoverFallbackMachine([nk1], job(108))?.id).toBe("NK1");
    expect(pickChangeoverFallbackMachine([nk1], job(51))).toBeNull();
  });

  it("assigns leftover wider than 15 mm to the closest magnet", () => {
    const sk1 = machine("SK1", 10, 0);
    const nk2 = machine("NK2", 100, 8);
    expect(pickNearestMachineByStep([sk1, nk2], job(100))?.id).toBe("NK2");
    expect(pickNearestMachineByStep([sk1], job(51))?.id).toBe("SK1");
  });
});
