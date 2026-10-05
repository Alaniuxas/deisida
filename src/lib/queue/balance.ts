import {
  canKeepWideJobOnNarrowLane,
  pickBestMachineForJob,
  pickChangeoverFallbackMachine,
  pickNearestMachineByStep,
  isJobEligibleForMachine,
} from "./assign-job";
import { DEFAULT_CHANGEOVER_MINUTES, SHIFT_HOURS } from "./constants";
import {
  changeoverHoursFromSetup,
  nextSetupWidthAfterJob,
} from "./machine-width";
import { orderJobsByP1P2P3 } from "./width-order";
import {
  addWorkDuration,
  snapToWorkStart,
  WORK_END_HOUR,
  WORK_START_HOUR,
} from "./work-hours";
import type { LockedWeek } from "./week";
import { addCalendarDays, vilniusDateIso, zonedTimeToUtc } from "./week";
import type { Machine, PickCriterion, QueueJob } from "./types";

export interface BalancedMachineState extends Machine {
  plannedWidthMm: number | null;
  assignedJobs: QueueJob[];
}

function toDate(deadline: Date | string): Date {
  return deadline instanceof Date ? deadline : new Date(deadline);
}

function compareDeadlines(a: Date | string, b: Date | string): number {
  return toDate(a).getTime() - toDate(b).getTime();
}

export function lockedWeekMondayStart(week: LockedWeek): Date {
  const [year, month, day] = week.startIso.split("-").map(Number);
  return zonedTimeToUtc(year, month, day, WORK_START_HOUR, 0);
}

/** When planning before the locked week, anchor queued work to Monday 08:00 Vilnius. */
export function plannerReferenceTime(now: Date, lockedWeek: LockedWeek): Date {
  const weekStart = lockedWeekMondayStart(lockedWeek);
  return now.getTime() < weekStart.getTime() ? weekStart : snapToWorkStart(now);
}

function storedWidthOrUnknown(storedWidthMm: number): number | null {
  return storedWidthMm > 0 ? storedWidthMm : null;
}

function magnetWidth(machine: BalancedMachineState): number | null {
  return storedWidthOrUnknown(machine.plannedWidthMm ?? machine.currentWidthMm);
}

function productionHoursForJob(
  job: QueueJob,
  machine: BalancedMachineState,
): number {
  const piecesPerDay = machine.piecesPerDay ?? 0;
  if (piecesPerDay > 0 && job.pieceCount > 0) {
    return (job.pieceCount / piecesPerDay) * SHIFT_HOURS;
  }
  return (job.quantityPallets / Math.max(machine.dailyRatePieces, 1)) * SHIFT_HOURS;
}

/** Productive hours for one job given the lane's current sequential setup. */
export function estimateJobHours(
  job: QueueJob,
  machine: BalancedMachineState,
  setupWidthMm: number,
): number {
  return (
    productionHoursForJob(job, machine) +
    changeoverHoursFromSetup(
      setupWidthMm,
      job.tileWidthMm,
      DEFAULT_CHANGEOVER_MINUTES,
    )
  );
}

function machineLoadHours(machine: BalancedMachineState): number {
  const magnet = magnetWidth(machine) ?? 0;
  const ordered = orderJobsByP1P2P3(
    machine.assignedJobs,
    magnet,
    0,
    (job) => job.tileWidthMm,
    (job) => job.storisMm,
    (job) => job.deadline,
    (job) => job.proposalId,
    (job) => job.pieceCount,
  );
  let setup = magnet;
  let total = 0;
  for (const job of ordered) {
    total += estimateJobHours(job, machine, setup);
    setup = nextSetupWidthAfterJob(setup, job.tileWidthMm);
  }
  return total;
}

function isEligibleForJob(
  machine: BalancedMachineState,
  job: QueueJob,
  _preferredMachineId: string | undefined,
): boolean {
  return isJobEligibleForMachine(machine, job);
}

export function assignJobsWithLoadBalance(
  machineStates: BalancedMachineState[],
  jobs: QueueJob[],
  widthAssignment: Map<number, { machineId: string; criterion: PickCriterion }>,
): void {
  const sortedJobs = [...jobs].sort((left, right) =>
    compareDeadlines(left.deadline, right.deadline),
  );

  for (const job of sortedJobs) {
    const preferredMachineId = widthAssignment.get(job.tileWidthMm)?.machineId;
    const withLoad = machineStates.map((machine) => ({
      ...machine,
      loadHours: machineLoadHours(machine),
    }));
    if (job.pinnedMachineId) {
      const pinned = withLoad.find(
        (machine) => machine.id === job.pinnedMachineId,
      );
      if (pinned) {
        pinned.assignedJobs.push(job);
        continue;
      }
    }
    const preferredLastResort =
      preferredMachineId != null
        ? withLoad.find(
            (machine) =>
              machine.id === preferredMachineId &&
              canKeepWideJobOnNarrowLane(machine, job),
          )
        : undefined;
    const target =
      pickBestMachineForJob(withLoad, job, preferredMachineId) ??
      withLoad
        .filter((machine) => isEligibleForJob(machine, job, preferredMachineId))
        .sort(
          (left, right) =>
            machineLoadHours(left) - machineLoadHours(right) ||
            left.id.localeCompare(right.id),
        )[0] ??
      pickChangeoverFallbackMachine(withLoad, job) ??
      pickNearestMachineByStep(withLoad, job) ??
      preferredLastResort;
    if (!target) {
      continue;
    }
    target.assignedJobs.push(job);
  }
}

const MIN_LOAD_GAP_HOURS = 2;

function isReceiverEligibleForRebalance(
  receiver: BalancedMachineState,
  job: QueueJob,
): boolean {
  return isEligibleForJob(receiver, job, undefined);
}

export function rebalanceEmptyMachines(machineStates: BalancedMachineState[]): void {
  const totalHours = machineStates.reduce(
    (sum, machine) => sum + machineLoadHours(machine),
    0,
  );
  const targetPerMachine = machineStates.length > 0 ? totalHours / machineStates.length : 0;

  for (let pass = 0; pass < machineStates.length * 2; pass += 1) {
    const empty = machineStates.filter((machine) => machine.assignedJobs.length === 0);
    if (empty.length === 0) {
      break;
    }

    const donors = [...machineStates]
      .filter((machine) => machine.assignedJobs.length > 0)
      .sort((left, right) => machineLoadHours(right) - machineLoadHours(left));

    let moved = false;
    for (const receiver of empty) {
      const donor = donors.find(
        (machine) => machineLoadHours(machine) > targetPerMachine * 0.5,
      );
      if (!donor) {
        continue;
      }

      const movable = [...donor.assignedJobs]
        .filter((job) => isEligibleForJob(receiver, job, donor.id))
        .sort((left, right) => compareDeadlines(right.deadline, left.deadline));

      const job = movable[0];
      if (!job) {
        continue;
      }

      donor.assignedJobs = donor.assignedJobs.filter((candidate) => candidate.id !== job.id);
      receiver.assignedJobs.push(job);
      if (receiver.plannedWidthMm == null) {
        receiver.plannedWidthMm = job.tileWidthMm;
      }
      moved = true;
    }

    if (!moved) {
      break;
    }
  }
}

/** Perkelia darbus iš perkrautų staklių į mažiau apkrautas (±5 mm, valandų balansas). */
export function rebalanceMachineLoads(machineStates: BalancedMachineState[]): void {
  rebalanceEmptyMachines(machineStates);

  if (machineStates.length <= 1) {
    return;
  }

  for (let pass = 0; pass < machineStates.length * 24; pass += 1) {
    const ranked = [...machineStates].sort(
      (left, right) => machineLoadHours(right) - machineLoadHours(left),
    );
    const donor = ranked[0];
    const receiver = ranked[ranked.length - 1];
    const loadGap = machineLoadHours(donor) - machineLoadHours(receiver);

    if (loadGap < MIN_LOAD_GAP_HOURS) {
      break;
    }

    const movable = [...donor.assignedJobs]
      .filter((job) => isReceiverEligibleForRebalance(receiver, job))
      .sort((left, right) => compareDeadlines(right.deadline, left.deadline));

    const job = movable[0];
    if (!job) {
      break;
    }

    donor.assignedJobs = donor.assignedJobs.filter((candidate) => candidate.id !== job.id);
    receiver.assignedJobs.push(job);
    if (receiver.plannedWidthMm == null) {
      receiver.plannedWidthMm = job.tileWidthMm;
    }
  }
}

function workdayStart(week: LockedWeek, dayIndex: number): Date {
  const iso = addCalendarDays(week.startIso, dayIndex);
  const [year, month, day] = iso.split("-").map(Number);
  return zonedTimeToUtc(year, month, day, WORK_START_HOUR, 0);
}

export function createDayCursors(lockedWeek: LockedWeek): Date[] {
  return Array.from({ length: 5 }, (_, day) => workdayStart(lockedWeek, day));
}

export function pickSpreadDay(globalDayLoads: number[], machineIndex: number, jobIndex: number): number {
  let bestDay = 0;
  let bestLoad = Number.POSITIVE_INFINITY;
  for (let day = 0; day < 5; day += 1) {
    const load = globalDayLoads[day] ?? 0;
    if (load < bestLoad) {
      bestLoad = load;
      bestDay = day;
    }
  }

  const staggerDay = (machineIndex + jobIndex) % 5;
  if (globalDayLoads[staggerDay] === bestLoad) {
    return staggerDay;
  }
  return bestDay;
}

export function recordSpreadHours(
  globalDayLoads: number[],
  dayCursors: Date[],
  lockedWeek: LockedWeek,
  start: Date,
  end: Date,
): void {
  for (let day = 0; day < 5; day += 1) {
    const dayIso = addCalendarDays(lockedWeek.startIso, day);
    const dayStart = workdayStart(lockedWeek, day);
    const [year, month, dayOfMonth] = dayIso.split("-").map(Number);
    const dayEnd = zonedTimeToUtc(year, month, dayOfMonth, WORK_END_HOUR, 0);
    const overlapStart = Math.max(start.getTime(), dayStart.getTime());
    const overlapEnd = Math.min(end.getTime(), dayEnd.getTime());
    if (overlapEnd > overlapStart) {
      globalDayLoads[day] += (overlapEnd - overlapStart) / (60 * 60 * 1000);
    }
    const startDay = vilniusDateIso(start);
    const endDay = vilniusDateIso(end);
    if (startDay <= dayIso && endDay >= dayIso && end.getTime() > dayCursors[day].getTime()) {
      dayCursors[day] = end;
    }
  }
}

export function spreadCursorForJob(
  lockedWeek: LockedWeek,
  dayCursors: Date[],
  globalDayLoads: number[],
  machineIndex: number,
  jobIndex: number,
): Date {
  const targetDay = pickSpreadDay(globalDayLoads, machineIndex, jobIndex);
  const dayStart = workdayStart(lockedWeek, targetDay);
  const cursor = dayCursors[targetDay];
  return cursor.getTime() < dayStart.getTime() ? dayStart : cursor;
}

export function scheduleBalancedJob(
  cursor: Date,
  durationHours: number,
): { start: Date; end: Date } {
  return addWorkDuration(cursor, durationHours);
}
