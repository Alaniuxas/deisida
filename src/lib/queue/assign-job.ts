import {
  isJobAssignableWithChangeover,
  isJobCompatibleWithStoredSetup,
  storedMachineWidth,
  WIDTH_SETUP_TOLERANCE_MM,
} from "./machine-width";
import type { Machine, QueueJob } from "./types";

export interface AssignableMachine extends Machine {
  plannedWidthMm?: number | null;
  assignedJobs: QueueJob[];
  loadHours?: number;
}

export function widthGapMm(
  machineWidthMm: number | null | undefined,
  jobWidthMm: number,
): number {
  const stored = storedMachineWidth(machineWidthMm);
  if (stored == null) {
    return 0;
  }
  return Math.abs(stored - jobWidthMm);
}

export function isStrictWidthMatch(
  machineWidthMm: number | null | undefined,
  jobWidthMm: number,
): boolean {
  const stored = storedMachineWidth(machineWidthMm);
  return stored != null && stored === jobWidthMm;
}

/** Job fits machine admin setup within tolerance. */
export function isJobEligibleForMachine(
  machine: AssignableMachine,
  job: QueueJob,
): boolean {
  const stored = storedMachineWidth(machine.currentWidthMm);
  if (stored != null) {
    return isJobCompatibleWithStoredSetup(job.tileWidthMm, stored);
  }

  const planned = storedMachineWidth(machine.plannedWidthMm);
  if (planned != null) {
    return isJobCompatibleWithStoredSetup(job.tileWidthMm, planned);
  }

  if (machine.assignedJobs.length === 0) {
    return true;
  }

  const runningWidth = machine.assignedJobs[0]?.tileWidthMm;
  return Math.abs(runningWidth - job.tileWidthMm) <= WIDTH_SETUP_TOLERANCE_MM;
}

/**
 * Lower score = better machine for this job.
 * Infinity = not eligible.
 */
export function scoreMachineForJob(
  machine: AssignableMachine,
  job: QueueJob,
  preferredMachineId?: string,
): number {
  if (!isJobEligibleForMachine(machine, job)) {
    return Number.POSITIVE_INFINITY;
  }

  const gap = widthGapMm(machine.currentWidthMm, job.tileWidthMm);
  const preferredBonus = machine.id === preferredMachineId ? 0 : 1;
  const loadHours = machine.loadHours ?? machine.assignedJobs.length;
  // Pirmiausia užpildyti mažiau apkrautas stakles (non-stop gamyba), tada mažesnis plotio skirtumas.
  return loadHours * 1000 + gap * 10 + preferredBonus;
}

export function pickBestMachineForJob(
  machines: AssignableMachine[],
  job: QueueJob,
  preferredMachineId?: string,
): AssignableMachine | null {
  const eligible = machines
    .map((machine) => ({ machine, score: scoreMachineForJob(machine, job, preferredMachineId) }))
    .filter((entry) => Number.isFinite(entry.score))
    .sort((left, right) => left.score - right.score || left.machine.id.localeCompare(right.machine.id));

  if (eligible.length > 0) {
    return eligible[0].machine;
  }

  return null;
}

/**
 * Last resort when no ±5 mm home exists: nearest magnet within 15 mm
 * (changeover required). Wider leftover uses pickNearestMachineByStep.
 */
export function pickChangeoverFallbackMachine(
  machines: AssignableMachine[],
  job: QueueJob,
): AssignableMachine | null {
  const ranked = machines
    .map((machine) => ({
      machine,
      gap: widthGapMm(machine.currentWidthMm, job.tileWidthMm),
      loadHours: machine.loadHours ?? machine.assignedJobs.length,
    }))
    .filter((entry) =>
      isJobAssignableWithChangeover(
        job.tileWidthMm,
        entry.machine.currentWidthMm,
      ),
    )
    .sort(
      (left, right) =>
        left.loadHours - right.loadHours ||
        left.gap - right.gap ||
        left.machine.id.localeCompare(right.machine.id),
    );

  return ranked[0]?.machine ?? null;
}

/** Any machine can cut any width: closest mm step, then lighter load. */
export function pickNearestMachineByStep(
  machines: AssignableMachine[],
  job: QueueJob,
): AssignableMachine | null {
  if (machines.length === 0) {
    return null;
  }
  const ranked = [...machines].sort((left, right) => {
    const gapLeft = widthGapMm(left.currentWidthMm, job.tileWidthMm);
    const gapRight = widthGapMm(right.currentWidthMm, job.tileWidthMm);
    if (gapLeft !== gapRight) {
      return gapLeft - gapRight;
    }
    const loadLeft = left.loadHours ?? left.assignedJobs.length;
    const loadRight = right.loadHours ?? right.assignedJobs.length;
    if (loadLeft !== loadRight) {
      return loadLeft - loadRight;
    }
    return left.id.localeCompare(right.id);
  });
  return ranked[0] ?? null;
}

/** Last resort: narrow lane keeps wide job only if already queued there. */
export function canKeepWideJobOnNarrowLane(
  machine: AssignableMachine,
  job: QueueJob,
): boolean {
  if (isJobEligibleForMachine(machine, job)) {
    return true;
  }
  return machine.assignedJobs.some((assigned) => assigned.id === job.id);
}
