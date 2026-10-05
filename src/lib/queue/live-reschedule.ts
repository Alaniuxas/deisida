import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  jobs,
  machines,
  palletLogs,
  proposals,
  queueOverrides,
  queuePlanItems,
  queuePlanRuns,
} from "@/lib/db/schema";
import { getLatestPlanRun } from "./plan";
import { backfillIdleLanes } from "./backfill-idle-lanes";
import {
  latestDowntimeEndByMachine,
  listPlanningDowntimes,
  unavailableMachineIdsFromDowntimes,
} from "./downtime-queries";
import {
  buildJobPlanSnapshots,
  findDeadlineImpacts,
  findNewlyLateJobs,
  type DeadlineImpactJob,
} from "./deadline-impact";
import {
  estimatePiecesPerHourFromLogs,
  remainingProductionHours,
} from "./actual-pace";
import { DEFAULT_CHANGEOVER_MINUTES } from "./constants";
import {
  buildDowntimeWindows,
  redistributeQueuedFromUnavailableMachines,
  type DowntimeMove,
} from "./downtime-redistribute";
import {
  mergeLaneOrders,
  optimizeDowntimeJobPlacements,
  rebuildAssignmentLaneTimes,
  repairLateAssignments,
} from "./downtime-deadline-optimize";
import { applyTemporalBalance } from "./temporal-balance";
import { rescheduleAssignmentLanes } from "./reschedule-assignments";
import { computeJobDurationHours, storedWidthOrUnknown } from "./schedule";
import { nextSetupWidthAfterJob } from "./machine-width";
import type { Assignment, Machine, QueueJob } from "./types";
import {
  isJobStartInLockedPlanWeek,
  type LockedWeek,
} from "./week";
import { durationHoursFromPlan } from "./work-hours";

export interface LiveRescheduleResult {
  updatedCount: number;
  moves: number;
  redistributed: number;
  downtimeMoves: DowntimeMove[];
}

export interface ExtraDowntimeInput {
  machineId: string;
  startAt: string;
  endAt: string;
}

export interface DowntimeReschedulePreview {
  moveCount: number;
  moves: DowntimeMove[];
  lateJobs: DeadlineImpactJob[];
  newlyLate: DeadlineImpactJob[];
}

interface ReschedulePreload {
  run: NonNullable<Awaited<ReturnType<typeof getLatestPlanRun>>>;
  machineRows: (typeof machines.$inferSelect)[];
  jobRows: Array<{ job: typeof jobs.$inferSelect }>;
}

interface ComputeRescheduleOptions {
  redistribute: boolean;
  allowAccepted: boolean;
  dryRun?: boolean;
  extraDowntimes?: ExtraDowntimeInput[];
  /** Preview UI — skip pallet pace, optimize placements, full lane replan, repair loops. */
  previewLight?: boolean;
  /** Queued jobs kept on the down machine — not auto-moved during downtime. */
  excludeFromDowntimeMove?: string[];
  preload?: ReschedulePreload;
}

interface ComputeRescheduleResult {
  assignments: Assignment[];
  moves: number;
  redistributed: number;
  downtimeMoves: DowntimeMove[];
  runId: string;
  lockedWeek: LockedWeek;
}

function toPlannerJob(row: {
  job: typeof jobs.$inferSelect;
}): QueueJob {
  return {
    id: row.job.id,
    tileWidthMm: row.job.widthMm,
    storisMm: row.job.storisMm,
    quantityPallets: 1,
    pieceCount: row.job.pieceCount,
    deadline: row.job.deadline,
    cutType: "",
    proposalId: row.job.proposalId,
  };
}

function mergeExtraDowntimes(
  rows: (typeof import("@/lib/db/schema").machineDowntimes.$inferSelect)[],
  extra: ExtraDowntimeInput[] | undefined,
  now: Date,
): (typeof import("@/lib/db/schema").machineDowntimes.$inferSelect)[] {
  if (!extra?.length) return rows;
  const synthetic = extra.map((row, index) => ({
    id: `preview-${index}`,
    machineId: row.machineId,
    startAt: new Date(row.startAt).toISOString(),
    endAt: new Date(row.endAt).toISOString(),
    reason: "",
    createdAt: now.toISOString(),
    createdById: "",
  }));
  return [...rows, ...synthetic];
}

async function buildAssignmentsFromPlan(
  runId: string,
  machineRows: (typeof machines.$inferSelect)[],
  jobRows: Array<{ job: typeof jobs.$inferSelect }>,
): Promise<Assignment[]> {
  const items = await db
    .select()
    .from(queuePlanItems)
    .where(eq(queuePlanItems.runId, runId));

  const jobById = new Map(jobRows.map((row) => [row.job.id, row.job]));
  const machineById = new Map(machineRows.map((machine) => [machine.id, machine]));

  const assignments: Assignment[] = [];
  for (const item of items) {
    const job = jobById.get(item.jobId);
    const machine = machineById.get(item.machineId);
    if (!job || !machine) continue;
    const start = new Date(item.plannedStart);
    const end = new Date(item.plannedEnd);
    const durationHours = durationHoursFromPlan(start, end);
    assignments.push({
      jobId: item.jobId,
      machineId: item.machineId,
      proposalId: job.proposalId,
      cutType: "",
      tileWidthMm: item.widthMm || job.widthMm,
      storisMm: item.storisMm || job.storisMm,
      quantityPallets: 1,
      durationHours,
      changeoverHours: 0,
      estimatedStart: start,
      estimatedEnd: end,
      pickCriterion: "width",
      pickStartHours: 0,
      otherMachineId: null,
      otherStartHours: null,
      priority: (item.priority as Assignment["priority"]) ?? "P3",
    });
  }
  return assignments;
}

async function persistAssignments(
  runId: string,
  assignments: Assignment[],
  lockedWeek: LockedWeek,
): Promise<number> {
  let updatedCount = 0;
  for (const assignment of assignments) {
    await db
      .update(queuePlanItems)
      .set({
        machineId: assignment.machineId,
        plannedStart: assignment.estimatedStart.toISOString(),
        plannedEnd: assignment.estimatedEnd.toISOString(),
        lockedWeek: isJobStartInLockedPlanWeek(assignment.estimatedStart, lockedWeek),
      })
      .where(
        and(
          eq(queuePlanItems.runId, runId),
          eq(queuePlanItems.jobId, assignment.jobId),
        ),
      );
    await db
      .update(jobs)
      .set({ machineId: assignment.machineId })
      .where(eq(jobs.id, assignment.jobId));
    updatedCount += 1;
  }
  return updatedCount;
}

async function computeLiveReschedule(
  now: Date,
  options: ComputeRescheduleOptions,
): Promise<ComputeRescheduleResult | null> {
  const run = options.preload?.run ?? (await getLatestPlanRun());
  if (!run) {
    return null;
  }
  if (!options.allowAccepted && run.status === "accepted") {
    return null;
  }

  const lockedWeek: LockedWeek = {
    startIso: run.lockedWeekStart,
    endIso: run.lockedWeekEnd,
  };

  const machineRows = options.preload?.machineRows ?? (await db.select().from(machines));
  const jobRows =
    options.preload?.jobRows ??
    (await db
      .select({ job: jobs })
      .from(jobs)
      .where(inArray(jobs.status, ["queued", "in_progress"])));

  const [logRows, planningDowntimes] = await Promise.all([
    options.previewLight ? Promise.resolve([] as (typeof palletLogs.$inferSelect)[]) : db.select().from(palletLogs),
    listPlanningDowntimes(now),
  ]);

  const mergedDowntimes = mergeExtraDowntimes(
    planningDowntimes,
    options.extraDowntimes,
    now,
  );
  const downtimeWindows = buildDowntimeWindows(mergedDowntimes);
  const unavailableMachineIds = unavailableMachineIdsFromDowntimes(mergedDowntimes);
  const downtimeEndByMachine = latestDowntimeEndByMachine(mergedDowntimes);
  const machineCodeById = new Map(
    machineRows.map((machine) => [machine.id, machine.code]),
  );
  const inProgressJobIds = new Set(
    jobRows
      .filter((row) => row.job.status === "in_progress")
      .map((row) => row.job.id),
  );

  const plannerMachines: Machine[] = machineRows.map((machine) => ({
    id: machine.id,
    currentWidthMm: machine.currentWidthMm ?? 0,
    dailyRatePieces: machine.dailyRate,
    changeoverMinutes: DEFAULT_CHANGEOVER_MINUTES,
    piecesPerDay: machine.piecesPerDay ?? undefined,
  }));

  const plannerJobs = jobRows.map(toPlannerJob);
  const availableMachines = plannerMachines.filter(
    (machine) => !unavailableMachineIds.has(machine.id),
  );
  let assignments = await buildAssignmentsFromPlan(run.id, machineRows, jobRows);

  const excludeFromDowntimeMove = new Set(options.excludeFromDowntimeMove ?? []);

  let redistributed = 0;
  let downtimeMoves: DowntimeMove[] = [];
  let laneOrderByMachine = new Map<string, string[]>();
  if (options.redistribute && downtimeWindows.size > 0) {
    const result = redistributeQueuedFromUnavailableMachines(
      assignments,
      plannerMachines,
      plannerJobs,
      downtimeWindows,
      inProgressJobIds,
      machineCodeById,
      excludeFromDowntimeMove,
    );
    redistributed = result.moved;
    downtimeMoves = result.moves;

    if (downtimeMoves.length > 0 && !options.previewLight) {
      laneOrderByMachine = optimizeDowntimeJobPlacements({
        assignments,
        machines: plannerMachines,
        jobs: plannerJobs,
        movedJobIds: downtimeMoves.map((move) => move.jobId),
        unavailableMachineIds,
        inProgressJobIds,
        machineCodeById,
        downtimeMoves,
      });
    }
  }

  const affectedMachineIds = new Set<string>();
  for (const window of downtimeWindows.values()) {
    affectedMachineIds.add(window.machineId);
  }
  for (const move of downtimeMoves) {
    affectedMachineIds.add(move.fromMachineId);
    affectedMachineIds.add(move.toMachineId);
  }

  if (!options.previewLight) {
    const logsByJob = new Map<string, typeof logRows>();
    for (const log of logRows) {
      const list = logsByJob.get(log.jobId) ?? [];
      list.push(log);
      logsByJob.set(log.jobId, list);
    }

    for (const machine of plannerMachines) {
      const lane = assignments
        .filter((assignment) => assignment.machineId === machine.id)
        .sort(
          (left, right) => left.estimatedStart.getTime() - right.estimatedStart.getTime(),
        );
      let setupWidthMm = storedWidthOrUnknown(machine.currentWidthMm) ?? 0;

      for (const assignment of lane) {
        const job = jobRows.find((row) => row.job.id === assignment.jobId)?.job;
        if (!job || job.status === "in_progress") continue;
        if (!isJobStartInLockedPlanWeek(assignment.estimatedStart, lockedWeek)) continue;

        const logs = (logsByJob.get(job.id) ?? []).map((log) => ({
          goodQuantity: log.goodQuantity ?? log.quantity,
          defectQuantity: log.defectQuantity ?? 0,
          loggedAt: log.loggedAt,
        }));
        const pace = estimatePiecesPerHourFromLogs(
          logs,
          machine.piecesPerDay ?? machine.dailyRatePieces,
        );
        const remaining = Math.max(0, job.pieceCount - job.completedPieces);
        const productionHours = remainingProductionHours(remaining, pace);
        const { changeoverHours } = computeJobDurationHours(
          { quantityPallets: 1, pieceCount: remaining, tileWidthMm: job.widthMm },
          machine,
          setupWidthMm,
        );
        assignment.durationHours = productionHours + changeoverHours;
        assignment.changeoverHours = changeoverHours;
        setupWidthMm = nextSetupWidthAfterJob(setupWidthMm, job.widthMm);
      }
    }
  }

  const temporalMachines = machineRows
    .filter((machine) => !unavailableMachineIds.has(machine.id))
    .map((machine) => ({
      id: machine.id,
      code: machine.code,
      currentWidthMm: machine.currentWidthMm ?? 0,
    }));
  let moves = 0;
  if (!options.previewLight) {
    moves = applyTemporalBalance(assignments, temporalMachines, lockedWeek).length;
    backfillIdleLanes(assignments, availableMachines, plannerJobs, lockedWeek);
    assignments = rescheduleAssignmentLanes(
      assignments,
      plannerMachines,
      plannerJobs,
      lockedWeek,
      now,
      {
        inProgressJobIds: [...inProgressJobIds],
        laneOrderByMachine:
          laneOrderByMachine.size > 0 ? laneOrderByMachine : undefined,
      },
    );
    rebuildAssignmentLaneTimes({
      assignments,
      machines: plannerMachines,
      jobRows,
      downtimeEndByMachine,
      now,
    });
  } else {
    rebuildAssignmentLaneTimes({
      assignments,
      machines: plannerMachines,
      jobRows,
      downtimeEndByMachine,
      now,
      machineIds: affectedMachineIds,
    });
  }

  if (options.redistribute && downtimeMoves.length > 0 && !options.previewLight) {
    const seedJobIds = new Set(downtimeMoves.map((move) => move.jobId));
    for (let pass = 0; pass < 2; pass += 1) {
      const repairOrders = repairLateAssignments({
        assignments,
        machines: plannerMachines,
        jobs: plannerJobs,
        seedJobIds,
        unavailableMachineIds,
        inProgressJobIds,
        machineCodeById,
        excludeJobIds: excludeFromDowntimeMove,
      });
      if (repairOrders.size === 0) break;

      laneOrderByMachine = mergeLaneOrders(laneOrderByMachine, repairOrders);
      assignments = rescheduleAssignmentLanes(
        assignments,
        plannerMachines,
        plannerJobs,
        lockedWeek,
        now,
        {
          inProgressJobIds: [...inProgressJobIds],
          laneOrderByMachine,
        },
      );
      rebuildAssignmentLaneTimes({
        assignments,
        machines: plannerMachines,
        jobRows,
        downtimeEndByMachine,
        now,
      });
    }
  }

  return {
    assignments,
    moves,
    redistributed,
    downtimeMoves,
    runId: run.id,
    lockedWeek,
  };
}

async function applyLiveReschedule(
  now: Date,
  options: ComputeRescheduleOptions,
): Promise<LiveRescheduleResult | null> {
  const computed = await computeLiveReschedule(now, options);
  if (!computed) {
    return null;
  }

  const run = await getLatestPlanRun();
  if (!run) {
    return null;
  }

  const updatedCount = await persistAssignments(
    computed.runId,
    computed.assignments,
    computed.lockedWeek,
  );

  if (computed.downtimeMoves.length > 0) {
    const createdAt = now.toISOString();
    await db.insert(queueOverrides).values(
      computed.downtimeMoves.map((move) => ({
        id: crypto.randomUUID(),
        runId: computed.runId,
        jobId: move.jobId,
        fromMachineId: move.fromMachineId,
        toMachineId: move.toMachineId,
        fromStart: move.fromStart,
        toStart: move.toStart,
        reason: move.reason,
        userId: null,
        createdAt,
      })),
    );
  }

  if (
    computed.moves > 0 ||
    computed.redistributed > 0 ||
    options.allowAccepted
  ) {
    await db
      .update(queuePlanRuns)
      .set({
        generatedAt: now.toISOString(),
        status: run.status === "accepted" ? "ready" : run.status,
      })
      .where(eq(queuePlanRuns.id, computed.runId));
  }

  return {
    updatedCount,
    moves: computed.moves,
    redistributed: computed.redistributed,
    downtimeMoves: computed.downtimeMoves,
  };
}

/** Simulate downtime reschedule without saving — for deadline confirmation UI. */
export async function previewMachineDowntimeReschedule(
  input: ExtraDowntimeInput,
  now = new Date(),
): Promise<DowntimeReschedulePreview | null> {
  const run = await getLatestPlanRun();
  if (!run) {
    return null;
  }

  const [machineRows, jobRows, proposalRows] = await Promise.all([
    db.select().from(machines),
    db
      .select({ job: jobs })
      .from(jobs)
      .where(inArray(jobs.status, ["queued", "in_progress"])),
    db.select({ id: proposals.id, number: proposals.number }).from(proposals),
  ]);

  const machineCodeById = new Map(
    machineRows.map((machine) => [machine.id, machine.code]),
  );
  const proposalNumbers = new Map(
    proposalRows.map((row) => [row.id, row.number]),
  );
  const jobsFlat = jobRows.map((row) => row.job);

  const beforeAssignments = await buildAssignmentsFromPlan(
    run.id,
    machineRows,
    jobRows,
  );
  const beforeSnapshots = buildJobPlanSnapshots(
    beforeAssignments,
    jobsFlat,
    proposalNumbers,
    machineCodeById,
  );

  const after = await computeLiveReschedule(now, {
    redistribute: true,
    allowAccepted: true,
    dryRun: true,
    previewLight: true,
    extraDowntimes: [input],
    preload: {
      run,
      machineRows,
      jobRows,
    },
  });
  if (!after) {
    return null;
  }

  const afterSnapshots = buildJobPlanSnapshots(
    after.assignments,
    jobsFlat,
    proposalNumbers,
    machineCodeById,
  );
  const lateJobs = findDeadlineImpacts(beforeSnapshots, afterSnapshots);
  const newlyLate = findNewlyLateJobs(lateJobs);

  return {
    moveCount: after.downtimeMoves.length,
    moves: after.downtimeMoves,
    lateJobs: newlyLate,
    newlyLate,
  };
}

/** After pallet log / job finish — times only, no cross-machine redistribution. */
export async function rescheduleRemainingWeek(
  now = new Date(),
): Promise<LiveRescheduleResult | null> {
  return applyLiveReschedule(now, {
    redistribute: false,
    allowAccepted: false,
  });
}

/**
 * After machine downtime create/delete — redistributes queued jobs to other
 * conveyors and rebuilds the plan (works even when plan was accepted).
 */
export async function rescheduleForMachineDowntime(
  now = new Date(),
  options?: { excludeJobIds?: string[] },
): Promise<LiveRescheduleResult | null> {
  return applyLiveReschedule(now, {
    redistribute: true,
    allowAccepted: true,
    excludeFromDowntimeMove: options?.excludeJobIds,
  });
}
