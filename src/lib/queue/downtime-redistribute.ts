import {
  pickBestMachineForJob,
  pickChangeoverFallbackMachine,
  pickNearestMachineByStep,
  type AssignableMachine,
} from "./assign-job";
import { DEFAULT_CHANGEOVER_MINUTES } from "./constants";
import type { Assignment, Machine, QueueJob } from "./types";

export interface DowntimeMove {
  jobId: string;
  fromMachineId: string;
  toMachineId: string;
  fromMachineCode: string;
  toMachineCode: string;
  jobWidthMm: number;
  fromStart: string;
  toStart: string;
  reason: string;
}

export interface MachineDowntimeWindow {
  machineId: string;
  startAt: Date;
  endAt: Date;
}

function toDate(deadline: Date | string): Date {
  return deadline instanceof Date ? deadline : new Date(deadline);
}

function compareDeadlines(a: Date | string, b: Date | string): number {
  return toDate(a).getTime() - toDate(b).getTime();
}

/** Merge overlapping downtime rows per machine. */
export function buildDowntimeWindows(
  downtimes: Array<{ machineId: string; startAt: string; endAt: string }>,
): Map<string, MachineDowntimeWindow> {
  const map = new Map<string, MachineDowntimeWindow>();
  for (const row of downtimes) {
    const startAt = new Date(row.startAt);
    const endAt = new Date(row.endAt);
    const existing = map.get(row.machineId);
    if (!existing) {
      map.set(row.machineId, {
        machineId: row.machineId,
        startAt,
        endAt,
      });
      continue;
    }
    map.set(row.machineId, {
      machineId: row.machineId,
      startAt: startAt.getTime() < existing.startAt.getTime() ? startAt : existing.startAt,
      endAt: endAt.getTime() > existing.endAt.getTime() ? endAt : existing.endAt,
    });
  }
  return map;
}

/**
 * Move only queued jobs that would run before the machine is back.
 * Jobs planned to start after downtime end stay on the original machine.
 */
export function shouldMoveJobForDowntime(
  assignment: Assignment,
  window: MachineDowntimeWindow,
  inProgress: boolean,
): boolean {
  if (inProgress) {
    return false;
  }
  return assignment.estimatedStart.getTime() < window.endAt.getTime();
}

function buildAssignableMachines(
  machines: Machine[],
  assignments: Assignment[],
  jobs: QueueJob[],
  unavailableMachineIds: Set<string>,
): AssignableMachine[] {
  const jobById = new Map(jobs.map((job) => [job.id, job]));
  const byMachine = new Map<string, QueueJob[]>();
  for (const assignment of assignments) {
    const job = jobById.get(assignment.jobId);
    if (!job) continue;
    const list = byMachine.get(assignment.machineId) ?? [];
    list.push(job);
    byMachine.set(assignment.machineId, list);
  }

  return machines
    .filter((machine) => !unavailableMachineIds.has(machine.id))
    .map((machine) => ({
      ...machine,
      changeoverMinutes: machine.changeoverMinutes ?? DEFAULT_CHANGEOVER_MINUTES,
      assignedJobs: byMachine.get(machine.id) ?? [],
      loadHours: assignments
        .filter((assignment) => assignment.machineId === machine.id)
        .reduce((sum, assignment) => sum + assignment.durationHours, 0),
    }));
}

function pickReceiverForJob(
  machines: AssignableMachine[],
  job: QueueJob,
): AssignableMachine | null {
  return (
    pickBestMachineForJob(machines, job) ??
    pickChangeoverFallbackMachine(machines, job) ??
    pickNearestMachineByStep(machines, job)
  );
}

/**
 * Moves queued jobs off down machines when planned start is before repair end.
 * Uses the same width priority bands as initial planning: ±5 mm → ≤15 mm →
 * nearest magnet. Mutates assignments in place.
 */
export function redistributeQueuedFromUnavailableMachines(
  assignments: Assignment[],
  machines: Machine[],
  jobs: QueueJob[],
  downtimeWindows: Map<string, MachineDowntimeWindow>,
  inProgressJobIds: Set<string>,
  machineCodeById: Map<string, string>,
  excludeJobIds: Set<string> = new Set(),
): { moved: number; moves: DowntimeMove[] } {
  if (downtimeWindows.size === 0) {
    return { moved: 0, moves: [] };
  }

  const unavailableMachineIds = new Set(downtimeWindows.keys());
  const jobById = new Map(jobs.map((job) => [job.id, job]));
  const moves: DowntimeMove[] = [];

  const toMove = assignments
    .filter((assignment) => {
      if (excludeJobIds.has(assignment.jobId)) return false;
      const window = downtimeWindows.get(assignment.machineId);
      if (!window) return false;
      return shouldMoveJobForDowntime(
        assignment,
        window,
        inProgressJobIds.has(assignment.jobId),
      );
    })
    .sort((left, right) => {
      const leftJob = jobById.get(left.jobId);
      const rightJob = jobById.get(right.jobId);
      if (!leftJob || !rightJob) return 0;
      return compareDeadlines(leftJob.deadline, rightJob.deadline);
    });

  for (const assignment of toMove) {
    const job = jobById.get(assignment.jobId);
    if (!job) continue;

    const receivers = buildAssignableMachines(
      machines,
      assignments,
      jobs,
      unavailableMachineIds,
    );
    const receiver = pickReceiverForJob(receivers, job);
    if (!receiver) {
      continue;
    }

    const fromMachineId = assignment.machineId;
    const fromStart = assignment.estimatedStart.toISOString();
    const fromCode = machineCodeById.get(fromMachineId) ?? fromMachineId;
    const toCode = machineCodeById.get(receiver.id) ?? receiver.id;
    assignment.machineId = receiver.id;
    moves.push({
      jobId: assignment.jobId,
      fromMachineId,
      toMachineId: receiver.id,
      fromMachineCode: fromCode,
      toMachineCode: toCode,
      jobWidthMm: job.tileWidthMm,
      fromStart,
      toStart: assignment.estimatedStart.toISOString(),
      reason: `Gedimas ${fromCode}: perkelta į ${toCode} (${job.tileWidthMm} mm).`,
    });
  }

  return { moved: moves.length, moves };
}
