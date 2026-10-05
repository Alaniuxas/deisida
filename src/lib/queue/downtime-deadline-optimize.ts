import { SHOP_MACHINE_ORDER } from "./constants";
import { isJobPastDeadline } from "./deadline-impact";
import { cutByIsoFromDate } from "./format";
import type { DowntimeMove } from "./downtime-redistribute";
import { recalculateLaneAssignments } from "./schedule";
import {
  buildBestLaneSlot,
  suggestMoveTargets,
  type MoveLaneJob,
  type MoveTargetMachine,
} from "./suggest-move";
import type { Assignment, Machine, QueueJob } from "./types";
import { snapToWorkStart } from "./work-hours";

function compareDeadlines(left: string, right: string): number {
  return new Date(left).getTime() - new Date(right).getTime();
}

function buildLaneJobsByMachine(
  assignments: Assignment[],
  jobs: QueueJob[],
  inProgressJobIds: Set<string>,
): Map<string, MoveLaneJob[]> {
  const jobById = new Map(jobs.map((row) => [row.id, row]));
  const map = new Map<string, MoveLaneJob[]>();

  for (const assignment of assignments) {
    const job = jobById.get(assignment.jobId);
    if (!job) continue;
    const list = map.get(assignment.machineId) ?? [];
    list.push({
      jobId: assignment.jobId,
      widthMm: assignment.tileWidthMm || job.tileWidthMm,
      pieceCount: job.pieceCount,
      quantityPallets: assignment.quantityPallets || 1,
      estimatedStart: assignment.estimatedStart,
      estimatedEnd: assignment.estimatedEnd,
      status: inProgressJobIds.has(assignment.jobId) ? "in_progress" : "queued",
    });
    map.set(assignment.machineId, list);
  }

  for (const list of map.values()) {
    list.sort(
      (left, right) => left.estimatedStart.getTime() - right.estimatedStart.getTime(),
    );
  }
  return map;
}

function toTargetMachines(
  machines: Machine[],
  unavailableMachineIds: Set<string>,
  machineCodeById: Map<string, string>,
): MoveTargetMachine[] {
  return machines
    .filter((machine) => {
      const code = machineCodeById.get(machine.id) ?? machine.id;
      return (
        !unavailableMachineIds.has(machine.id) &&
        (SHOP_MACHINE_ORDER as readonly string[]).includes(code)
      );
    })
    .map((machine) => ({
      id: machine.id,
      code: machineCodeById.get(machine.id) ?? machine.id,
      currentWidthMm: machine.currentWidthMm ?? 0,
      dailyRatePieces: machine.dailyRatePieces,
      piecesPerDay: machine.piecesPerDay,
      changeoverMinutes: machine.changeoverMinutes,
    }));
}

function applyRoughLaneOrder(
  assignments: Assignment[],
  machineId: string,
  orderedJobIds: string[],
): void {
  const byJob = new Map(
    assignments
      .filter((row) => row.machineId === machineId)
      .map((row) => [row.jobId, row]),
  );
  const base = new Date("2026-10-06T08:00:00+03:00").getTime();
  const hourMs = 4 * 60 * 60 * 1000;

  orderedJobIds.forEach((jobId, index) => {
    const row = byJob.get(jobId);
    if (!row) return;
    row.estimatedStart = new Date(base + index * hourMs);
    row.estimatedEnd = new Date(base + (index + 1) * hourMs);
  });
}

function pickBestSuggestion(
  suggestions: ReturnType<typeof suggestMoveTargets>,
) {
  return (
    suggestions.find((row) => row.recommended) ??
    suggestions.find((row) => row.meetsDeadline) ??
    suggestions[0] ??
    null
  );
}

function placeJobWithDeadlineSlot(input: {
  assignments: Assignment[];
  machines: Machine[];
  jobs: QueueJob[];
  jobId: string;
  targetMachines: MoveTargetMachine[];
  unavailableMachineIds: Set<string>;
  inProgressJobIds: Set<string>;
  machineCodeById: Map<string, string>;
  downtimeMoves?: DowntimeMove[];
}): { machineId: string; orderedJobIds: string[] } | null {
  const job = input.jobs.find((row) => row.id === input.jobId);
  const assignment = input.assignments.find((row) => row.jobId === input.jobId);
  if (!job || !assignment) return null;

  const laneJobsByMachine = buildLaneJobsByMachine(
    input.assignments,
    input.jobs,
    input.inProgressJobIds,
  );
  const cutByIso = cutByIsoFromDate(job.deadline);

  const suggestions = suggestMoveTargets({
    movingJob: {
      jobId: job.id,
      widthMm: job.tileWidthMm,
      pieceCount: job.pieceCount,
      quantityPallets: assignment.quantityPallets || 1,
      fromMachineId: assignment.machineId,
    },
    cutByIso,
    machines: input.targetMachines,
    laneJobsByMachine,
  });

  const pick = pickBestSuggestion(suggestions);
  if (!pick) return null;

  const previousMachineId = assignment.machineId;
  assignment.machineId = pick.machineId;

  if (input.downtimeMoves && previousMachineId !== pick.machineId) {
    const move = input.downtimeMoves.find((row) => row.jobId === input.jobId);
    if (move) {
      move.toMachineId = pick.machineId;
      move.toMachineCode =
        input.machineCodeById.get(pick.machineId) ?? pick.machineId;
      move.reason = `Gedimas ${move.fromMachineCode}: perkelta į ${move.toMachineCode} (${job.tileWidthMm} mm, terminas).`;
    }
  }

  const machine = input.machines.find((row) => row.id === pick.machineId);
  if (!machine) return null;

  const laneJobs = laneJobsByMachine.get(pick.machineId) ?? [];
  const slot = buildBestLaneSlot(
    {
      id: machine.id,
      code: input.machineCodeById.get(machine.id) ?? machine.id,
      currentWidthMm: machine.currentWidthMm ?? 0,
      dailyRatePieces: machine.dailyRatePieces,
      piecesPerDay: machine.piecesPerDay,
      changeoverMinutes: machine.changeoverMinutes,
    },
    laneJobs,
    {
      jobId: job.id,
      widthMm: job.tileWidthMm,
      pieceCount: job.pieceCount,
      quantityPallets: assignment.quantityPallets || 1,
    },
    cutByIso,
  );

  applyRoughLaneOrder(input.assignments, pick.machineId, slot.orderedJobIds);
  return { machineId: pick.machineId, orderedJobIds: slot.orderedJobIds };
}

/**
 * After width-based downtime moves — pick receiver + insert position using
 * the same deadline simulation as manual move suggestions.
 */
export function optimizeDowntimeJobPlacements(input: {
  assignments: Assignment[];
  machines: Machine[];
  jobs: QueueJob[];
  movedJobIds: string[];
  unavailableMachineIds: Set<string>;
  inProgressJobIds: Set<string>;
  machineCodeById: Map<string, string>;
  downtimeMoves: DowntimeMove[];
}): Map<string, string[]> {
  const laneOrderByMachine = new Map<string, string[]>();
  const jobById = new Map(input.jobs.map((row) => [row.id, row]));
  const targetMachines = toTargetMachines(
    input.machines,
    input.unavailableMachineIds,
    input.machineCodeById,
  );

  const sorted = [...new Set(input.movedJobIds)].sort((left, right) => {
    const leftJob = jobById.get(left);
    const rightJob = jobById.get(right);
    if (!leftJob || !rightJob) return 0;
    return compareDeadlines(leftJob.deadline, rightJob.deadline);
  });

  for (const jobId of sorted) {
    const placed = placeJobWithDeadlineSlot({
      assignments: input.assignments,
      machines: input.machines,
      jobs: input.jobs,
      jobId,
      targetMachines,
      unavailableMachineIds: input.unavailableMachineIds,
      inProgressJobIds: input.inProgressJobIds,
      machineCodeById: input.machineCodeById,
      downtimeMoves: input.downtimeMoves,
    });
    if (placed) {
      laneOrderByMachine.set(placed.machineId, placed.orderedJobIds);
    }
  }

  return laneOrderByMachine;
}

function listRepairableLateJobIds(
  assignments: Assignment[],
  jobs: QueueJob[],
  inProgressJobIds: Set<string>,
  seedJobIds: Set<string>,
  limit: number,
  excludeJobIds: Set<string> = new Set(),
): string[] {
  const jobById = new Map(jobs.map((row) => [row.id, row]));
  const receiverMachines = new Set<string>();
  for (const assignment of assignments) {
    if (seedJobIds.has(assignment.jobId)) {
      receiverMachines.add(assignment.machineId);
    }
  }

  const candidates = assignments
    .filter((assignment) => !inProgressJobIds.has(assignment.jobId))
    .filter((assignment) => !excludeJobIds.has(assignment.jobId))
    .filter((assignment) => {
      const job = jobById.get(assignment.jobId);
      if (!job) return false;
      if (!isJobPastDeadline(assignment.estimatedEnd, job.deadline)) {
        return false;
      }
      return (
        seedJobIds.has(assignment.jobId) ||
        receiverMachines.has(assignment.machineId)
      );
    })
    .sort((left, right) => {
      const leftJob = jobById.get(left.jobId);
      const rightJob = jobById.get(right.jobId);
      if (!leftJob || !rightJob) return 0;
      return compareDeadlines(leftJob.deadline, rightJob.deadline);
    });

  return candidates.slice(0, limit).map((row) => row.jobId);
}

/** Second pass after times are rebuilt — try to fix remaining late jobs. */
export function repairLateAssignments(input: {
  assignments: Assignment[];
  machines: Machine[];
  jobs: QueueJob[];
  seedJobIds: Set<string>;
  unavailableMachineIds: Set<string>;
  inProgressJobIds: Set<string>;
  machineCodeById: Map<string, string>;
  maxJobsPerPass?: number;
  excludeJobIds?: Set<string>;
}): Map<string, string[]> {
  const laneOrderByMachine = new Map<string, string[]>();
  const targetMachines = toTargetMachines(
    input.machines,
    input.unavailableMachineIds,
    input.machineCodeById,
  );
  const maxJobsPerPass = input.maxJobsPerPass ?? 30;
  const excludeJobIds = input.excludeJobIds ?? new Set<string>();

  const lateJobIds = listRepairableLateJobIds(
    input.assignments,
    input.jobs,
    input.inProgressJobIds,
    input.seedJobIds,
    maxJobsPerPass,
    excludeJobIds,
  );

  for (const jobId of lateJobIds) {
    const placed = placeJobWithDeadlineSlot({
      assignments: input.assignments,
      machines: input.machines,
      jobs: input.jobs,
      jobId,
      targetMachines,
      unavailableMachineIds: input.unavailableMachineIds,
      inProgressJobIds: input.inProgressJobIds,
      machineCodeById: input.machineCodeById,
    });
    if (!placed) continue;
    laneOrderByMachine.set(placed.machineId, placed.orderedJobIds);
  }

  return laneOrderByMachine;
}

export function rebuildAssignmentLaneTimes(input: {
  assignments: Assignment[];
  machines: Machine[];
  jobRows: Array<{ job: { id: string; pieceCount: number; widthMm: number; status: string } }>;
  downtimeEndByMachine: Map<string, Date>;
  now: Date;
  /** When set, only these lanes are recalculated (preview fast path). */
  machineIds?: Set<string>;
}): void {
  const cursor = snapToWorkStart(input.now);
  const jobById = new Map(input.jobRows.map((row) => [row.job.id, row.job]));
  const machines =
    input.machineIds && input.machineIds.size > 0
      ? input.machines.filter((machine) => input.machineIds!.has(machine.id))
      : input.machines;

  for (const machine of machines) {
    const downtimeEnd = input.downtimeEndByMachine.get(machine.id);
    const laneCursor =
      downtimeEnd && downtimeEnd.getTime() > cursor.getTime() ? downtimeEnd : cursor;
    const lane = input.assignments
      .filter((assignment) => assignment.machineId === machine.id)
      .sort(
        (left, right) => left.estimatedStart.getTime() - right.estimatedStart.getTime(),
      );

    const rolling: Assignment[] = [];
    for (const assignment of lane) {
      const job = jobById.get(assignment.jobId);
      if (!job) continue;
      if (job.status === "in_progress") {
        rolling.push(assignment);
        continue;
      }
      if (assignment.estimatedStart.getTime() < laneCursor.getTime()) {
        assignment.estimatedStart = laneCursor;
      }
      rolling.push(assignment);
    }

    const laneItems = rolling
      .map((assignment) => {
        const job = jobById.get(assignment.jobId);
        if (!job) return null;
        return {
          job: {
            pieceCount: job.pieceCount,
            widthMm: job.widthMm,
            status: job.status,
          },
          assignment,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

    const recalculated = recalculateLaneAssignments(laneItems, machine);
    for (const assignment of recalculated) {
      const index = input.assignments.findIndex((row) => row.jobId === assignment.jobId);
      if (index >= 0) input.assignments[index] = assignment;
    }
  }
}

export function mergeLaneOrders(
  base: Map<string, string[]>,
  extra: Map<string, string[]>,
): Map<string, string[]> {
  const merged = new Map(base);
  for (const [machineId, order] of extra) {
    merged.set(machineId, order);
  }
  return merged;
}
