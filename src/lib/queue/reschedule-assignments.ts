import { lockedWeekMondayStart } from "./balance";
import { recalculateLaneAssignments, storedWidthOrUnknown } from "./schedule";
import type { Assignment, Machine, QueueJob } from "./types";
import type { LockedWeek } from "./week";
import { plannerReferenceTime } from "./balance";

export function rescheduleAssignmentLanes(
  assignments: Assignment[],
  machines: Machine[],
  jobs: QueueJob[],
  lockedWeek: LockedWeek,
  now = new Date(),
  options?: {
    priorityJobIds?: string[];
    inProgressJobIds?: string[];
    laneOrderByMachine?: Map<string, string[]>;
  },
): Assignment[] {
  const jobById = new Map(jobs.map((job) => [job.id, job]));
  const referenceTime = plannerReferenceTime(now, lockedWeek);
  const weekMonday = lockedWeekMondayStart(lockedWeek);
  const anchor =
    referenceTime.getTime() < weekMonday.getTime() ? weekMonday : referenceTime;
  const priorityIds = new Set(options?.priorityJobIds ?? []);
  const inProgressIds = new Set(options?.inProgressJobIds ?? []);

  const byMachine = new Map<string, Assignment[]>();
  for (const assignment of assignments) {
    const list = byMachine.get(assignment.machineId) ?? [];
    list.push(assignment);
    byMachine.set(assignment.machineId, list);
  }

  const updated: Assignment[] = [];
  for (const machine of machines) {
    const customOrder = options?.laneOrderByMachine?.get(machine.id);
    const lane = (byMachine.get(machine.id) ?? []).sort((left, right) => {
      const leftBusy = inProgressIds.has(left.jobId) ? 0 : 1;
      const rightBusy = inProgressIds.has(right.jobId) ? 0 : 1;
      if (leftBusy !== rightBusy) {
        return leftBusy - rightBusy;
      }
      if (customOrder) {
        const orderIndex = new Map(customOrder.map((jobId, index) => [jobId, index]));
        const leftIndex = orderIndex.get(left.jobId) ?? Number.MAX_SAFE_INTEGER;
        const rightIndex = orderIndex.get(right.jobId) ?? Number.MAX_SAFE_INTEGER;
        if (leftIndex !== rightIndex) {
          return leftIndex - rightIndex;
        }
      } else {
        const leftPriority = priorityIds.has(left.jobId) ? 0 : 1;
        const rightPriority = priorityIds.has(right.jobId) ? 0 : 1;
        if (leftPriority !== rightPriority) {
          return leftPriority - rightPriority;
        }
      }
      return left.estimatedStart.getTime() - right.estimatedStart.getTime();
    });
    if (lane.length === 0) continue;

    const laneItems = lane
      .map((assignment) => {
        const job = jobById.get(assignment.jobId);
        if (!job) return null;
        return {
          job: {
            pieceCount: job.pieceCount,
            widthMm: job.tileWidthMm,
            status: "queued",
          },
          assignment,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

    const first = laneItems[0];
    if (first) {
      first.assignment.estimatedStart = anchor;
    }

    const recalculated = recalculateLaneAssignments(laneItems, machine);
    updated.push(...recalculated);
  }

  return updated.sort(
    (left, right) => left.estimatedStart.getTime() - right.estimatedStart.getTime(),
  );
}

export function runningWidthAfterJob(
  machine: Machine,
  jobWidthMm: number,
  setupWidthMm: number,
): number {
  const base = setupWidthMm > 0 ? setupWidthMm : storedWidthOrUnknown(machine.currentWidthMm) ?? 0;
  return base > 0 ? base : jobWidthMm;
}
