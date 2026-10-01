import { DEFAULT_CHANGEOVER_MINUTES, SHIFT_HOURS } from "./constants";
import { addWorkDuration, snapToWorkStart, WORK_HOURS_PER_DAY, WORK_START_HOUR } from "./work-hours";
import type { LockedWeek } from "./week";
import { addCalendarDays, zonedTimeToUtc } from "./week";
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

const HOURS_PER_DAY = 24;

function storedWidthOrUnknown(storedWidthMm: number): number | null {
  return storedWidthMm > 0 ? storedWidthMm : null;
}

function magnetWidth(machine: BalancedMachineState): number | null {
  return storedWidthOrUnknown(machine.plannedWidthMm ?? machine.currentWidthMm);
}

function widthDistance(machine: BalancedMachineState, jobWidthMm: number): number {
  const width = magnetWidth(machine);
  return width == null ? Number.POSITIVE_INFINITY : Math.abs(width - jobWidthMm);
}

function estimateJobHours(job: QueueJob, machine: BalancedMachineState): number {
  const plannedWidthMm = magnetWidth(machine);
  const piecesPerDay = machine.piecesPerDay ?? 0;
  const productionHours =
    piecesPerDay > 0 && job.pieceCount > 0
      ? (job.pieceCount / piecesPerDay) * SHIFT_HOURS
      : (job.quantityPallets / Math.max(machine.dailyRatePieces, 1)) * HOURS_PER_DAY;
  const changeoverHours =
    plannedWidthMm != null &&
    plannedWidthMm > 0 &&
    plannedWidthMm === job.tileWidthMm
      ? 0
      : DEFAULT_CHANGEOVER_MINUTES / 60;
  return productionHours + changeoverHours;
}

function machineLoadHours(machine: BalancedMachineState): number {
  return machine.assignedJobs.reduce(
    (sum, job) => sum + estimateJobHours(job, machine),
    0,
  );
}

function isEligibleForJob(
  machine: BalancedMachineState,
  job: QueueJob,
  preferredMachineId: string | undefined,
): boolean {
  if (machine.id === preferredMachineId) {
    return true;
  }

  const width = magnetWidth(machine);
  if (width == null) {
    return true;
  }

  if (Math.abs(width - job.tileWidthMm) <= 2) {
    return true;
  }

  if (machine.assignedJobs.length === 0) {
    return true;
  }

  return false;
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
    const eligible = machineStates.filter((machine) =>
      isEligibleForJob(machine, job, preferredMachineId),
    );
    const candidates = eligible.length > 0 ? eligible : machineStates;

    candidates.sort((left, right) => {
      const preferredLeft = left.id === preferredMachineId ? 0 : 1;
      const preferredRight = right.id === preferredMachineId ? 0 : 1;
      if (preferredLeft !== preferredRight) {
        return preferredLeft - preferredRight;
      }

      const loadGap = machineLoadHours(left) - machineLoadHours(right);
      if (loadGap !== 0) {
        return loadGap;
      }

      const widthGap =
        widthDistance(left, job.tileWidthMm) - widthDistance(right, job.tileWidthMm);
      if (widthGap !== 0) {
        return widthGap;
      }

      return left.id.localeCompare(right.id);
    });

    const target = candidates[0] ?? machineStates[0];
    target.assignedJobs.push(job);
  }
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
      moved = true;
    }

    if (!moved) {
      break;
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
    const dayEnd = new Date(dayStart.getTime() + WORK_HOURS_PER_DAY * 60 * 60 * 1000);
    const overlapStart = Math.max(start.getTime(), dayStart.getTime());
    const overlapEnd = Math.min(end.getTime(), dayEnd.getTime());
    if (overlapEnd > overlapStart) {
      globalDayLoads[day] += (overlapEnd - overlapStart) / (60 * 60 * 1000);
    }
    if (start.toISOString().slice(0, 10) <= dayIso && end.toISOString().slice(0, 10) >= dayIso) {
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
