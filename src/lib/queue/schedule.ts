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
): MachineState {
  const widthMatches = machineStates.filter(
    (machine) => machine.currentWidthMm === tileWidthMm,
  );

  if (widthMatches.length > 0) {
    return widthMatches.reduce((best, current) =>
      current.availableAtHours < best.availableAtHours ? current : best,
    );
  }

  return machineStates.reduce((best, current) => {
    const bestDelta = Math.abs(best.currentWidthMm - tileWidthMm);
    const currentDelta = Math.abs(current.currentWidthMm - tileWidthMm);

    if (currentDelta !== bestDelta) {
      return currentDelta < bestDelta ? current : best;
    }

    return current.availableAtHours < best.availableAtHours ? current : best;
  });
}

function earliestDeadline(jobs: QueueJob[]): Date | string {
  return jobs.reduce(
    (earliest, job) =>
      compareDeadlines(job.deadline, earliest) < 0 ? job.deadline : earliest,
    jobs[0].deadline,
  );
}

function appendJobsToMachine(machine: MachineState, jobs: QueueJob[]): void {
  const sorted = [...jobs].sort((left, right) =>
    compareDeadlines(left.deadline, right.deadline),
  );
  let runningWidthMm =
    machine.assignedJobs.length > 0
      ? machine.assignedJobs[machine.assignedJobs.length - 1].tileWidthMm
      : machine.currentWidthMm;

  for (const job of sorted) {
    const { durationHours } = computeJobDurationHours(job, {
      currentWidthMm: runningWidthMm,
      dailyRatePieces: machine.dailyRatePieces,
      changeoverMinutes: machine.changeoverMinutes,
    });
    machine.assignedJobs.push(job);
    machine.availableAtHours += durationHours;
    runningWidthMm = job.tileWidthMm;
  }
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

  const remainingWidthGroups: [number, QueueJob[]][] = [];

  for (const [width, widthJobs] of groupJobsByWidth(jobs)) {
    const exactMatches = machineStates.filter(
      (machine) => machine.currentWidthMm === width,
    );

    if (exactMatches.length > 0) {
      const machine = exactMatches.reduce((best, current) =>
        current.availableAtHours < best.availableAtHours ? current : best,
      );
      appendJobsToMachine(machine, widthJobs);
      continue;
    }

    remainingWidthGroups.push([width, widthJobs]);
  }

  remainingWidthGroups.sort(([, leftJobs], [, rightJobs]) =>
    compareDeadlines(earliestDeadline(leftJobs), earliestDeadline(rightJobs)),
  );

  for (const [width, widthJobs] of remainingWidthGroups) {
    appendJobsToMachine(pickMachine(machineStates, width), widthJobs);
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
