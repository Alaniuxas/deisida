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

interface MachineState extends Machine {
  availableAtHours: number;
  assignedJobs: QueueJob[];
}

function toDate(deadline: Date | string): Date {
  return deadline instanceof Date ? deadline : new Date(deadline);
}

function compareDeadlines(a: Date | string, b: Date | string): number {
  return toDate(a).getTime() - toDate(b).getTime();
}

export function computeJobDurationHours(
  job: Pick<QueueJob, "quantityPallets" | "tileWidthMm">,
  machine: Pick<Machine, "currentWidthMm" | "dailyRatePieces" | "changeoverMinutes">,
): { durationHours: number; changeoverHours: number; productionHours: number } {
  const productionHours =
    (job.quantityPallets / machine.dailyRatePieces) * HOURS_PER_DAY;
  const changeoverHours =
    job.tileWidthMm === machine.currentWidthMm
      ? 0
      : machine.changeoverMinutes / 60;

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

function groupJobsByProposal(jobs: QueueJob[]): Map<string, QueueJob[]> {
  const grouped = new Map<string, QueueJob[]>();

  for (const job of jobs) {
    const proposalJobs = grouped.get(job.proposalId);
    if (proposalJobs) {
      proposalJobs.push(job);
    } else {
      grouped.set(job.proposalId, [job]);
    }
  }

  return grouped;
}

function groupJobsByWidth(jobs: QueueJob[]): Map<number, QueueJob[]> {
  const grouped = new Map<number, QueueJob[]>();

  for (const job of jobs) {
    const widthJobs = grouped.get(job.tileWidthMm);
    if (widthJobs) {
      widthJobs.push(job);
    } else {
      grouped.set(job.tileWidthMm, [job]);
    }
  }

  return grouped;
}

export function pickMachine(
  machineStates: MachineState[],
  tileWidthMm: number,
  usedMachineIds: Set<string>,
  splitAcrossMachines: boolean,
): MachineState {
  const widthMatches = machineStates.filter(
    (machine) => machine.currentWidthMm === tileWidthMm,
  );

  if (widthMatches.length > 0) {
    const preferred = splitAcrossMachines
      ? widthMatches.filter((machine) => !usedMachineIds.has(machine.id))
      : widthMatches;

    const candidates = preferred.length > 0 ? preferred : widthMatches;

    return candidates.reduce((best, current) =>
      current.availableAtHours < best.availableAtHours ? current : best,
    );
  }

  const unused = splitAcrossMachines
    ? machineStates.filter((machine) => !usedMachineIds.has(machine.id))
    : machineStates;

  const candidates = unused.length > 0 ? unused : machineStates;

  return candidates.reduce((best, current) => {
    const bestDelta = Math.abs(best.currentWidthMm - tileWidthMm);
    const currentDelta = Math.abs(current.currentWidthMm - tileWidthMm);

    if (currentDelta !== bestDelta) {
      return currentDelta < bestDelta ? current : best;
    }

    return current.availableAtHours < best.availableAtHours ? current : best;
  });
}

function assignJobsToMachines(
  machines: Machine[],
  jobs: QueueJob[],
): MachineState[] {
  const machineStates: MachineState[] = machines.map((machine) => ({
    ...machine,
    availableAtHours: 0,
    assignedJobs: [],
  }));

  const proposals = [...groupJobsByProposal(jobs).entries()].sort(
    ([, leftJobs], [, rightJobs]) => {
      const leftDeadline = leftJobs.reduce(
        (earliest, job) =>
          compareDeadlines(job.deadline, earliest) < 0 ? job.deadline : earliest,
        leftJobs[0].deadline,
      );
      const rightDeadline = rightJobs.reduce(
        (earliest, job) =>
          compareDeadlines(job.deadline, earliest) < 0 ? job.deadline : earliest,
        rightJobs[0].deadline,
      );

      return compareDeadlines(leftDeadline, rightDeadline);
    },
  );

  for (const [, proposalJobs] of proposals) {
    const widthGroups = [...groupJobsByWidth(proposalJobs).entries()].sort(
      ([leftWidth], [rightWidth]) => leftWidth - rightWidth,
    );
    const splitAcrossMachines = widthGroups.length > 1;
    const usedMachineIds = new Set<string>();

    for (const [, widthJobs] of widthGroups) {
      const sortedWidthJobs = [...widthJobs].sort((left, right) =>
        compareDeadlines(left.deadline, right.deadline),
      );
      const machine = pickMachine(
        machineStates,
        sortedWidthJobs[0].tileWidthMm,
        usedMachineIds,
        splitAcrossMachines,
      );

      machine.assignedJobs.push(...sortedWidthJobs);
      usedMachineIds.add(machine.id);
    }
  }

  return machineStates;
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
  const machineStates = assignJobsToMachines(machines, jobs);
  const assignments: Assignment[] = [];

  for (const machine of machineStates) {
    const initialWidthMm = machine.currentWidthMm;
    const orderedJobs = sortJobsForMachine(machine.assignedJobs, initialWidthMm);
    let runningWidthMm = initialWidthMm;

    for (const job of orderedJobs) {
      const { durationHours, changeoverHours } = computeJobDurationHours(
        job,
        {
          currentWidthMm: runningWidthMm,
          dailyRatePieces: machine.dailyRatePieces,
          changeoverMinutes: machine.changeoverMinutes,
        },
      );

      const estimatedStart = addHours(referenceTime, machine.availableAtHours);
      const estimatedEnd = addHours(
        referenceTime,
        machine.availableAtHours + durationHours,
      );

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
      });

      machine.availableAtHours += durationHours;
      runningWidthMm = job.tileWidthMm;
    }
  }

  return assignments.sort(
    (left, right) => left.estimatedStart.getTime() - right.estimatedStart.getTime(),
  );
}
