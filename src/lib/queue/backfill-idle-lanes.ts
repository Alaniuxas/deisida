import type { Assignment, Machine, QueueJob } from "./types";
import { lockedWeekMondayStart } from "./balance";
import { nextSetupWidthAfterJob, WIDTH_SETUP_TOLERANCE_MM } from "./machine-width";
import {
  compareWidthDeadlinePriority,
  isDeadlineUrgent,
  widthGapAbs,
  widthStepBand,
} from "./width-priority";
import { isJobStartInLockedPlanWeek, lockedWeekFridayEnd, type LockedWeek } from "./week";
import { workHoursUntil } from "./work-hours";

export const MIN_IDLE_GAP_HOURS = 4;

export interface BackfillMove {
  jobId: string;
  fromMachineId: string;
  toMachineId: string;
  reason: string;
}

function toDate(deadline: Date | string): Date {
  return deadline instanceof Date ? deadline : new Date(deadline);
}

function laneJobsOnMachine(
  assignments: Assignment[],
  machineId: string,
): Assignment[] {
  return assignments
    .filter((assignment) => assignment.machineId === machineId)
    .sort(
      (left, right) =>
        left.estimatedStart.getTime() - right.estimatedStart.getTime(),
    );
}

function laneEndInLockedWeek(
  lane: Assignment[],
  lockedWeek: LockedWeek,
): Date | null {
  const inWeek = lane.filter((assignment) =>
    isJobStartInLockedPlanWeek(assignment.estimatedStart, lockedWeek),
  );
  if (inWeek.length === 0) {
    return null;
  }
  return inWeek.reduce(
    (latest, assignment) =>
      assignment.estimatedEnd.getTime() > latest.getTime()
        ? assignment.estimatedEnd
        : latest,
    inWeek[0].estimatedEnd,
  );
}

function sequentialSetupMm(
  storedWidthMm: number,
  lane: Assignment[],
): number {
  let setup = storedWidthMm > 0 ? storedWidthMm : 0;
  for (const assignment of lane) {
    setup = nextSetupWidthAfterJob(setup, assignment.tileWidthMm);
  }
  return setup;
}

function findBackfillCandidate(
  assignments: Assignment[],
  receiver: Machine,
  jobs: QueueJob[],
  lockedWeek: LockedWeek,
  movedJobIds: Set<string>,
): Assignment | null {
  const jobById = new Map(jobs.map((job) => [job.id, job]));
  const receiverLane = laneJobsOnMachine(assignments, receiver.id);
  const setupWidthMm = sequentialSetupMm(receiver.currentWidthMm, receiverLane);

  const laterOther = assignments.filter(
    (assignment) =>
      !movedJobIds.has(assignment.jobId) &&
      assignment.machineId !== receiver.id &&
      !isJobStartInLockedPlanWeek(assignment.estimatedStart, lockedWeek),
  );

  const ranked = laterOther
    .map((assignment) => {
      const job = jobById.get(assignment.jobId);
      const deadline = job?.deadline ?? assignment.estimatedStart;
      return {
        assignment,
        key: {
          urgent: isDeadlineUrgent(deadline, lockedWeek.endIso),
          band: widthStepBand(setupWidthMm, assignment.tileWidthMm),
          gap: widthGapAbs(setupWidthMm, assignment.tileWidthMm),
          deadlineMs: toDate(deadline).getTime(),
        },
      };
    })
    .sort((left, right) => compareWidthDeadlinePriority(left.key, right.key));

  return ranked[0]?.assignment ?? null;
}

function remainingIdleHours(
  machine: Machine,
  assignments: Assignment[],
  lockedWeek: LockedWeek,
  movedJobIds: Set<string>,
): number {
  const lane = laneJobsOnMachine(assignments, machine.id);
  const fridayEnd = lockedWeekFridayEnd(lockedWeek);
  const weekStart = lockedWeekMondayStart(lockedWeek);
  const laneEnd = laneEndInLockedWeek(lane, lockedWeek);
  const idleFrom = laneEnd ?? weekStart;
  const idleHours = workHoursUntil(idleFrom, fridayEnd);
  const movedHours = lane
    .filter((assignment) => movedJobIds.has(assignment.jobId))
    .reduce((sum, assignment) => sum + assignment.durationHours, 0);
  return idleHours - movedHours;
}

/**
 * Pull leftover (after locked week) jobs onto machines with Mon–Fri capacity.
 * Priority: urgent deadline, then ±5, then ≤15, then any width (smallest step).
 */
export function backfillIdleLanes(
  assignments: Assignment[],
  machines: Machine[],
  jobs: QueueJob[],
  lockedWeek: LockedWeek,
): BackfillMove[] {
  const moves: BackfillMove[] = [];
  const movedJobIds = new Set<string>();

  for (const machine of machines) {
    for (let pass = 0; pass < 32; pass += 1) {
      if (remainingIdleHours(machine, assignments, lockedWeek, movedJobIds) < MIN_IDLE_GAP_HOURS) {
        break;
      }

      const candidate = findBackfillCandidate(
        assignments,
        machine,
        jobs,
        lockedWeek,
        movedJobIds,
      );
      if (!candidate) {
        break;
      }

      const fromMachineId = candidate.machineId;
      candidate.machineId = machine.id;
      movedJobIds.add(candidate.jobId);
      const gap = widthGapAbs(
        sequentialSetupMm(
          machine.currentWidthMm,
          laneJobsOnMachine(assignments, machine.id).filter(
            (assignment) => assignment.jobId !== candidate.jobId,
          ),
        ),
        candidate.tileWidthMm,
      );
      moves.push({
        jobId: candidate.jobId,
        fromMachineId,
        toMachineId: machine.id,
        reason:
          gap <= WIDTH_SETUP_TOLERANCE_MM
            ? `Užpildyti laisvą staklę (±${WIDTH_SETUP_TOLERANCE_MM} mm)`
            : `Užpildyti laisvą staklę (reguliavimas ${gap} mm)`,
      });
    }
  }

  return moves;
}
