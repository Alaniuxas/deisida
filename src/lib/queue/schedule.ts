import {
  DEFAULT_CHANGEOVER_MINUTES,
  DEFAULT_ROTATION_HOURS,
  EMPTY_MACHINE_MIN_DISTANCE_MM,
  KNEW_MACHINE_DEFAULTS,
  KONV_MACHINE_DEFAULTS,
  SHIFT_HOURS,
  createDefaultMachines,
} from "./constants";
import {
  assignJobsWithLoadBalance,
  createDayCursors,
  rebalanceEmptyMachines,
  recordSpreadHours,
  scheduleBalancedJob,
  spreadCursorForJob,
  type BalancedMachineState,
} from "./balance";
import { addWorkDuration } from "./work-hours";
import { orderJobsByP1P2P3 } from "./width-order";
import type {
  Assignment,
  ClusterPriority,
  Machine,
  PickCriterion,
  QueueJob,
  ScheduleOptions,
} from "./types";

export {
  DEFAULT_CHANGEOVER_MINUTES,
  DEFAULT_ROTATION_HOURS,
  EMPTY_MACHINE_MIN_DISTANCE_MM,
  KNEW_MACHINE_DEFAULTS,
  KONV_MACHINE_DEFAULTS,
  SHIFT_HOURS,
  createDefaultMachines,
} from "./constants";
export type {
  Assignment,
  ClusterPriority,
  CutType,
  Machine,
  MachineDefaults,
  PickCriterion,
  QueueJob,
  ScheduleOptions,
} from "./types";

const HOURS_PER_DAY = 24;

interface MachineState extends Machine {
  availableAtHours: number;
  plannedWidthMm: number | null;
  plannedStorisMm: number | null;
  assignedJobs: QueueJob[];
}

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
  job: Pick<QueueJob, "quantityPallets" | "tileWidthMm" | "pieceCount">,
  machine: Pick<
    Machine,
    "currentWidthMm" | "dailyRatePieces" | "changeoverMinutes" | "piecesPerDay"
  >,
  plannedWidthMm: number | null = storedWidthOrUnknown(machine.currentWidthMm),
): { durationHours: number; changeoverHours: number; productionHours: number } {
  const piecesPerDay = machine.piecesPerDay ?? 0;
  const productionHours =
    piecesPerDay > 0 && job.pieceCount > 0
      ? (job.pieceCount / piecesPerDay) * SHIFT_HOURS
      : (job.quantityPallets / Math.max(machine.dailyRatePieces, 1)) * HOURS_PER_DAY;
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
  machineCurrentStorisMm = 0,
): QueueJob[] {
  return orderJobsByP1P2P3(
    jobs,
    machineCurrentWidthMm,
    machineCurrentStorisMm,
    (job) => job.tileWidthMm,
    (job) => job.storisMm,
    (job) => job.deadline,
  );
}

function uniqueWidths(jobs: QueueJob[]): number[] {
  return [...new Set(jobs.map((job) => job.tileWidthMm))];
}

function earliestDeadlineForWidth(jobs: QueueJob[], widthMm: number): number {
  return Math.min(
    ...jobs
      .filter((job) => job.tileWidthMm === widthMm)
      .map((job) => toDate(job.deadline).getTime()),
  );
}

function magnetWidth(machine: MachineState): number | null {
  return storedWidthOrUnknown(machine.plannedWidthMm ?? machine.currentWidthMm);
}

function assignWidthsToMachines(
  machines: MachineState[],
  jobs: QueueJob[],
): Map<number, { machineId: string; criterion: PickCriterion }> {
  const assignment = new Map<number, { machineId: string; criterion: PickCriterion }>();
  const remaining = new Set(uniqueWidths(jobs));
  if (remaining.size === 0 || machines.length === 0) {
    return assignment;
  }

  const magnets: { machineId: string; widthMm: number }[] = [];

  for (const machine of machines) {
    const width = storedWidthOrUnknown(machine.currentWidthMm);
    if (width == null) continue;
    magnets.push({ machineId: machine.id, widthMm: width });
    if (remaining.has(width)) {
      assignment.set(width, { machineId: machine.id, criterion: "p1" });
      remaining.delete(width);
    }
  }

  if (magnets.length === 0) {
    const seedWidth = [...remaining].sort((left, right) => {
      const deadlineGap =
        earliestDeadlineForWidth(jobs, left) - earliestDeadlineForWidth(jobs, right);
      if (deadlineGap !== 0) return deadlineGap;
      return left - right;
    })[0];
    const seedMachine = [...machines].sort((left, right) => {
      if (left.dailyRatePieces !== right.dailyRatePieces) {
        return right.dailyRatePieces - left.dailyRatePieces;
      }
      return left.id.localeCompare(right.id);
    })[0];
    assignment.set(seedWidth, { machineId: seedMachine.id, criterion: "rate" });
    remaining.delete(seedWidth);
    magnets.push({ machineId: seedMachine.id, widthMm: seedWidth });
    seedMachine.plannedWidthMm = seedWidth;
  }

  const claimed = new Set(magnets.map((magnet) => magnet.machineId));
  const empties = machines.filter((machine) => !claimed.has(machine.id));

  const distanceToMagnets = (widthMm: number): number => {
    if (magnets.length === 0) return Number.POSITIVE_INFINITY;
    return Math.min(...magnets.map((magnet) => Math.abs(magnet.widthMm - widthMm)));
  };

  for (const empty of empties) {
    if (remaining.size === 0) break;
    let farthest: number | null = null;
    let farthestDist = -1;
    for (const widthMm of remaining) {
      const distance = distanceToMagnets(widthMm);
      if (
        distance > farthestDist ||
        (distance === farthestDist &&
          farthest != null &&
          earliestDeadlineForWidth(jobs, widthMm) <
            earliestDeadlineForWidth(jobs, farthest))
      ) {
        farthest = widthMm;
        farthestDist = distance;
      }
    }
    if (farthest == null || farthestDist < EMPTY_MACHINE_MIN_DISTANCE_MM) {
      continue;
    }
    assignment.set(farthest, { machineId: empty.id, criterion: "far" });
    remaining.delete(farthest);
    magnets.push({ machineId: empty.id, widthMm: farthest });
    empty.plannedWidthMm = farthest;
  }

  for (const widthMm of remaining) {
    let nearest = magnets[0];
    let nearestDist = Math.abs(nearest.widthMm - widthMm);
    for (const magnet of magnets.slice(1)) {
      const distance = Math.abs(magnet.widthMm - widthMm);
      if (distance < nearestDist) {
        nearest = magnet;
        nearestDist = distance;
      }
    }
    const criterion: PickCriterion =
      nearestDist === 0 ? "p1" : nearestDist <= 2 ? "p2" : "width";
    assignment.set(widthMm, { machineId: nearest.machineId, criterion });
  }

  return assignment;
}

function toMachineState(
  machine: Machine & {
    availableAtHours?: number;
    plannedWidthMm?: number | null;
    plannedStorisMm?: number | null;
  },
): MachineState {
  return {
    id: machine.id,
    currentWidthMm: machine.currentWidthMm,
    dailyRatePieces: machine.dailyRatePieces,
    changeoverMinutes: machine.changeoverMinutes,
    piecesPerDay: machine.piecesPerDay,
    availableAtHours: machine.availableAtHours ?? 0,
    plannedWidthMm:
      machine.plannedWidthMm !== undefined
        ? machine.plannedWidthMm
        : storedWidthOrUnknown(machine.currentWidthMm),
    plannedStorisMm: machine.plannedStorisMm ?? null,
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
  const dummyJob: QueueJob = {
    id: "probe",
    tileWidthMm,
    storisMm: 0,
    quantityPallets: 1,
    pieceCount: 1,
    deadline: "2099-01-01",
    cutType: "pjovimas",
    proposalId: "probe",
  };
  const states = machineStates.map(toMachineState);
  const assigned = assignWidthsToMachines(states, [dummyJob]);
  const pickedId = assigned.get(tileWidthMm)?.machineId ?? states[0].id;
  return states.find((state) => state.id === pickedId) ?? states[0];
}

function jobPriority(
  job: QueueJob,
  previous: QueueJob | null,
  machineWidthMm: number,
): ClusterPriority {
  const referenceWidth = previous?.tileWidthMm ?? machineWidthMm;
  const referenceStoris = previous?.storisMm ?? 0;
  if (job.tileWidthMm === referenceWidth && job.storisMm === referenceStoris && job.storisMm > 0) {
    return "P1";
  }
  if (job.tileWidthMm === referenceWidth) {
    return "P2";
  }
  return "P3";
}

export function scheduleQueue(
  machines: Machine[],
  jobs: QueueJob[],
  options: ScheduleOptions = {},
): Assignment[] {
  const referenceTime = options.referenceTime ?? new Date();
  const balanceLockedWeek =
    options.balanceLockedWeek ?? Boolean(options.lockedWeek);
  const machineStates: MachineState[] = machines.map((machine) => toMachineState(machine));
  const widthAssignment = assignWidthsToMachines(machineStates, jobs);
  const picks = new Map<string, { criterion: PickCriterion; otherId: string | null }>();

  assignJobsWithLoadBalance(
    machineStates as BalancedMachineState[],
    jobs,
    widthAssignment,
  );
  if (balanceLockedWeek) {
    rebalanceEmptyMachines(machineStates as BalancedMachineState[]);
  }

  for (const job of jobs) {
    const pick = widthAssignment.get(job.tileWidthMm);
    const machine =
      machineStates.find((state) => state.assignedJobs.some((assigned) => assigned.id === job.id)) ??
      machineStates.find((state) => state.id === pick?.machineId) ??
      machineStates[0];
    const other =
      machineStates.find((state) => state.id !== machine.id) ?? null;
    picks.set(job.id, {
      criterion: pick?.criterion ?? "width",
      otherId: other?.id ?? null,
    });
  }

  const assignments: Assignment[] = [];
  const globalDayLoads = [0, 0, 0, 0, 0];
  const dayCursors =
    options.lockedWeek && balanceLockedWeek
      ? createDayCursors(options.lockedWeek)
      : null;

  machineStates.forEach((machine, machineIndex) => {
    const orderedJobs = sortJobsForMachine(
      machine.assignedJobs,
      machine.currentWidthMm,
    );
    let runningWidthMm = storedWidthOrUnknown(machine.currentWidthMm);
    let elapsedHours = 0;
    let cursor = referenceTime;
    let previous: QueueJob | null = null;

    orderedJobs.forEach((job, jobIndex) => {
      const { durationHours, changeoverHours } = computeJobDurationHours(
        job,
        machine,
        runningWidthMm,
      );
      const pick = picks.get(job.id);

      if (dayCursors && options.lockedWeek) {
        cursor = spreadCursorForJob(
          options.lockedWeek,
          dayCursors,
          globalDayLoads,
          machineIndex,
          jobIndex,
        );
      }

      const { start: estimatedStart, end: estimatedEnd } = dayCursors
        ? scheduleBalancedJob(cursor, durationHours)
        : addWorkDuration(cursor, durationHours);

      if (dayCursors && options.lockedWeek) {
        recordSpreadHours(
          globalDayLoads,
          dayCursors,
          options.lockedWeek,
          estimatedStart,
          estimatedEnd,
        );
      }

      assignments.push({
        jobId: job.id,
        machineId: machine.id,
        proposalId: job.proposalId,
        cutType: job.cutType,
        tileWidthMm: job.tileWidthMm,
        storisMm: job.storisMm,
        quantityPallets: job.quantityPallets,
        durationHours,
        changeoverHours,
        estimatedStart,
        estimatedEnd,
        pickCriterion: pick?.criterion ?? "width",
        pickStartHours: elapsedHours,
        otherMachineId: pick?.otherId ?? null,
        otherStartHours: null,
        priority: jobPriority(job, previous, machine.currentWidthMm),
      });

      elapsedHours += durationHours;
      cursor = estimatedEnd;
      runningWidthMm = job.tileWidthMm;
      previous = job;
    });
  });

  return assignments.sort(
    (left, right) => left.estimatedStart.getTime() - right.estimatedStart.getTime(),
  );
}
