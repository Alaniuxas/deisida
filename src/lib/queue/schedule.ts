import {
  DEFAULT_CHANGEOVER_MINUTES,
  DEFAULT_ROTATION_HOURS,
  KNEW_MACHINE_DEFAULTS,
  KONV_MACHINE_DEFAULTS,
  createDefaultMachines,
} from "./constants";
import { orderJobsByWidthCorrection } from "./width-order";
import type {
  Assignment,
  Machine,
  QueueJob,
  ScheduleOptions,
} from "./types";

export {
  DEFAULT_CHANGEOVER_MINUTES,
  DEFAULT_ROTATION_HOURS,
  KNEW_MACHINE_DEFAULTS,
  KONV_MACHINE_DEFAULTS,
  createDefaultMachines,
} from "./constants";
export type {
  Assignment,
  CutType,
  Machine,
  MachineDefaults,
  QueueJob,
  ScheduleOptions,
} from "./types";

const HOURS_PER_DAY = 24;

/** Starts within this window compare by |Δ mm| instead of earlier start. */
export const SIMILAR_START_WINDOW_HOURS = 4;

interface MachineState extends Machine {
  availableAtHours: number;
  plannedWidthMm: number | null;
  assignedJobs: QueueJob[];
}

export type PickCriterion = "start" | "width" | "rate";

function toDate(deadline: Date | string): Date {
  return deadline instanceof Date ? deadline : new Date(deadline);
}

function compareDeadlines(a: Date | string, b: Date | string): number {
  return toDate(a).getTime() - toDate(b).getTime();
}

export function storedWidthOrUnknown(storedWidthMm: number): number | null {
  return storedWidthMm > 0 ? storedWidthMm : null;
}

export function plannedWidthMatches(
  plannedWidthMm: number | null | undefined,
  jobWidthMm: number,
): boolean {
  return plannedWidthMm != null && plannedWidthMm > 0 && plannedWidthMm === jobWidthMm;
}

function changeoverHoursFor(
  plannedWidthMm: number | null,
  jobWidthMm: number,
  changeoverMinutes: number,
): number {
  return plannedWidthMatches(plannedWidthMm, jobWidthMm)
    ? 0
    : changeoverMinutes / 60;
}

export function computeJobDurationHours(
  job: Pick<QueueJob, "quantityPallets" | "tileWidthMm">,
  machine: Pick<Machine, "currentWidthMm" | "dailyRatePieces" | "changeoverMinutes">,
  plannedWidthMm: number | null = storedWidthOrUnknown(machine.currentWidthMm),
): { durationHours: number; changeoverHours: number; productionHours: number } {
  const productionHours =
    (job.quantityPallets / machine.dailyRatePieces) * HOURS_PER_DAY;
  const changeoverHours = changeoverHoursFor(
    plannedWidthMm,
    job.tileWidthMm,
    machine.changeoverMinutes,
  );

  return {
    durationHours: productionHours + changeoverHours,
    changeoverHours,
    productionHours,
  };
}

export function sortJobsForMachine(
  jobs: QueueJob[],
  machineCurrentWidthMm: number,
): QueueJob[] {
  return orderJobsByWidthCorrection(
    jobs,
    machineCurrentWidthMm,
    (job) => job.tileWidthMm,
    (job) => job.deadline,
  );
}

function startHoursFor(machine: MachineState, tileWidthMm: number): number {
  return (
    machine.availableAtHours +
    changeoverHoursFor(
      machine.plannedWidthMm,
      tileWidthMm,
      machine.changeoverMinutes,
    )
  );
}

function widthDelta(machine: MachineState, tileWidthMm: number): number {
  if (machine.plannedWidthMm == null || machine.plannedWidthMm <= 0) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.abs(machine.plannedWidthMm - tileWidthMm);
}

function compareMachineCandidates(
  left: MachineState,
  right: MachineState,
  tileWidthMm: number,
): { winner: MachineState; criterion: PickCriterion } {
  const leftStart = startHoursFor(left, tileWidthMm);
  const rightStart = startHoursFor(right, tileWidthMm);
  const startGap = Math.abs(leftStart - rightStart);

  if (startGap > SIMILAR_START_WINDOW_HOURS) {
    if (leftStart !== rightStart) {
      return {
        winner: leftStart < rightStart ? left : right,
        criterion: "start",
      };
    }
  } else {
    const leftDelta = widthDelta(left, tileWidthMm);
    const rightDelta = widthDelta(right, tileWidthMm);
    if (leftDelta !== rightDelta) {
      return {
        winner: leftDelta < rightDelta ? left : right,
        criterion: "width",
      };
    }
  }

  if (left.dailyRatePieces !== right.dailyRatePieces) {
    return {
      winner:
        left.dailyRatePieces > right.dailyRatePieces ? left : right,
      criterion: "rate",
    };
  }

  if (leftStart !== rightStart) {
    return {
      winner: leftStart < rightStart ? left : right,
      criterion: "start",
    };
  }

  return { winner: left, criterion: "rate" };
}

function toMachineState(
  machine: Machine & { availableAtHours?: number; plannedWidthMm?: number | null },
): MachineState {
  return {
    id: machine.id,
    currentWidthMm: machine.currentWidthMm,
    dailyRatePieces: machine.dailyRatePieces,
    changeoverMinutes: machine.changeoverMinutes,
    availableAtHours: machine.availableAtHours ?? 0,
    plannedWidthMm:
      machine.plannedWidthMm !== undefined
        ? machine.plannedWidthMm
        : storedWidthOrUnknown(machine.currentWidthMm),
    assignedJobs: [],
  };
}

export function pickMachine(
  machineStates: Array<
    Machine & {
      availableAtHours?: number;
      plannedWidthMm?: number | null;
      assignedJobs?: QueueJob[];
    }
  >,
  tileWidthMm: number,
): MachineState {
  const states = machineStates.map(toMachineState);
  return states.reduce((best, current) =>
    compareMachineCandidates(best, current, tileWidthMm).winner,
  );
}

function pickMachineWithReason(
  machineStates: MachineState[],
  tileWidthMm: number,
): {
  machine: MachineState;
  criterion: PickCriterion;
  startHours: number;
  other: MachineState | null;
  otherStartHours: number | null;
} {
  const machine = machineStates.reduce((best, current) =>
    compareMachineCandidates(best, current, tileWidthMm).winner,
  );
  const other =
    machineStates.find((candidate) => candidate.id !== machine.id) ?? null;
  const criterion = other
    ? compareMachineCandidates(machine, other, tileWidthMm).criterion
    : "rate";

  return {
    machine,
    criterion,
    startHours: startHoursFor(machine, tileWidthMm),
    other,
    otherStartHours: other ? startHoursFor(other, tileWidthMm) : null,
  };
}

function assignJobsToMachines(
  machines: Machine[],
  jobs: QueueJob[],
): { states: MachineState[]; picks: Map<string, ReturnType<typeof pickMachineWithReason>> } {
  const machineStates: MachineState[] = machines.map((machine) =>
    toMachineState(machine),
  );
  const picks = new Map<string, ReturnType<typeof pickMachineWithReason>>();
  const orderedJobs = [...jobs].sort((left, right) =>
    compareDeadlines(left.deadline, right.deadline),
  );

  for (const job of orderedJobs) {
    const pick = pickMachineWithReason(machineStates, job.tileWidthMm);
    const machine = pick.machine;
    const { durationHours } = computeJobDurationHours(
      job,
      machine,
      machine.plannedWidthMm,
    );
    machine.assignedJobs.push(job);
    machine.availableAtHours += durationHours;
    machine.plannedWidthMm = job.tileWidthMm;
    picks.set(job.id, pick);
  }

  return { states: machineStates, picks };
}

function addHours(referenceTime: Date, hours: number): Date {
  return new Date(referenceTime.getTime() + hours * 60 * 60 * 1000);
}

export function scheduleQueue(
  machines: Machine[],
  jobs: QueueJob[],
  options: ScheduleOptions = {},
): Assignment[] {
  const referenceTime = options.referenceTime ?? new Date();
  const { states: machineStates, picks } = assignJobsToMachines(machines, jobs);
  const assignments: Assignment[] = [];

  for (const machine of machineStates) {
    const initialWidthMm = machine.currentWidthMm;
    const orderedJobs = sortJobsForMachine(machine.assignedJobs, initialWidthMm);
    let runningWidthMm = storedWidthOrUnknown(initialWidthMm);
    let elapsedHours = 0;

    for (const job of orderedJobs) {
      const { durationHours, changeoverHours } = computeJobDurationHours(
        job,
        machine,
        runningWidthMm,
      );
      const pick = picks.get(job.id);
      const estimatedStart = addHours(referenceTime, elapsedHours);
      const estimatedEnd = addHours(referenceTime, elapsedHours + durationHours);

      assignments.push({
        jobId: job.id,
        machineId: machine.id,
        proposalId: job.proposalId,
        cutType: job.cutType,
        tileWidthMm: job.tileWidthMm,
        quantityPallets: job.quantityPallets,
        durationHours,
        changeoverHours,
        estimatedStart,
        estimatedEnd,
        pickCriterion: pick?.criterion ?? "start",
        pickStartHours: pick?.startHours ?? elapsedHours,
        otherMachineId: pick?.other?.id ?? null,
        otherStartHours: pick?.otherStartHours ?? null,
      });

      elapsedHours += durationHours;
      runningWidthMm = job.tileWidthMm;
    }
  }

  return assignments.sort(
    (left, right) => left.estimatedStart.getTime() - right.estimatedStart.getTime(),
  );
}
