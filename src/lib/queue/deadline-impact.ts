import {
  cutByIsoFromDate,
  formatDeadlineDate,
  formatScheduleTimestampFull,
} from "./format";
import type { Assignment } from "./types";

export interface JobPlanSnapshot {
  jobId: string;
  proposalNumber: string;
  machineCode: string;
  widthMm: number;
  deadline: string;
  plannedStart: string;
  plannedEnd: string;
}

export interface DeadlineImpactJob {
  jobId: string;
  proposalNumber: string;
  machineCode: string;
  widthMm: number;
  deadline: string;
  deadlineLabel: string;
  plannedEnd: string;
  plannedEndLabel: string;
  wasOnTimeBefore: boolean;
  moved: boolean;
  fromMachineCode?: string;
}

export function isJobPastDeadline(
  plannedEnd: string | Date,
  deadline: string,
): boolean {
  const cutBy = new Date(cutByIsoFromDate(deadline));
  const end = plannedEnd instanceof Date ? plannedEnd : new Date(plannedEnd);
  if (Number.isNaN(cutBy.getTime()) || Number.isNaN(end.getTime())) {
    return false;
  }
  return end.getTime() > cutBy.getTime();
}

export function buildJobPlanSnapshots(
  assignments: Assignment[],
  jobs: Array<{
    id: string;
    proposalId: string;
    widthMm: number;
    deadline: string;
  }>,
  proposalNumbers: Map<string, string>,
  machineCodeById: Map<string, string>,
): JobPlanSnapshot[] {
  const jobById = new Map(jobs.map((job) => [job.id, job]));
  const snapshots: JobPlanSnapshot[] = [];

  for (const assignment of assignments) {
    const job = jobById.get(assignment.jobId);
    if (!job) continue;
    snapshots.push({
      jobId: assignment.jobId,
      proposalNumber: proposalNumbers.get(job.proposalId) ?? job.proposalId,
      machineCode: machineCodeById.get(assignment.machineId) ?? assignment.machineId,
      widthMm: assignment.tileWidthMm || job.widthMm,
      deadline: job.deadline,
      plannedStart: assignment.estimatedStart.toISOString(),
      plannedEnd: assignment.estimatedEnd.toISOString(),
    });
  }

  return snapshots;
}

function toImpactJob(
  after: JobPlanSnapshot,
  before: JobPlanSnapshot | undefined,
): DeadlineImpactJob {
  const wasOnTimeBefore = before
    ? !isJobPastDeadline(before.plannedEnd, before.deadline)
    : false;
  const moved = Boolean(
    before &&
      (before.machineCode !== after.machineCode ||
        before.plannedStart !== after.plannedStart),
  );

  return {
    jobId: after.jobId,
    proposalNumber: after.proposalNumber,
    machineCode: after.machineCode,
    widthMm: after.widthMm,
    deadline: after.deadline,
    deadlineLabel: formatDeadlineDate(after.deadline),
    plannedEnd: after.plannedEnd,
    plannedEndLabel: formatScheduleTimestampFull(after.plannedEnd),
    wasOnTimeBefore,
    moved,
    fromMachineCode:
      moved && before && before.machineCode !== after.machineCode
        ? before.machineCode
        : undefined,
  };
}

/**
 * Jobs that end after the cut-by deadline and whose plan changed
 * (moved machine or pushed start time).
 */
export function findDeadlineImpacts(
  before: JobPlanSnapshot[],
  after: JobPlanSnapshot[],
): DeadlineImpactJob[] {
  const beforeByJob = new Map(before.map((row) => [row.jobId, row]));
  const impacts: DeadlineImpactJob[] = [];

  for (const row of after) {
    if (!isJobPastDeadline(row.plannedEnd, row.deadline)) continue;

    const previous = beforeByJob.get(row.jobId);
    const changed = Boolean(
      previous &&
        (previous.machineCode !== row.machineCode ||
          previous.plannedStart !== row.plannedStart ||
          previous.plannedEnd !== row.plannedEnd),
    );
    if (!changed) continue;

    impacts.push(toImpactJob(row, previous));
  }

  return impacts.sort(
    (left, right) =>
      Number(right.wasOnTimeBefore) - Number(left.wasOnTimeBefore) ||
      left.proposalNumber.localeCompare(right.proposalNumber),
  );
}

export function findNewlyLateJobs(impacts: DeadlineImpactJob[]): DeadlineImpactJob[] {
  return impacts.filter((row) => row.wasOnTimeBefore);
}
