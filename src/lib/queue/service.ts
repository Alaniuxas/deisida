import { cache } from "react";
import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  jobs,
  tiles,
  proposals,
  machines,
  machineAssignments,
  users,
  palletLogs,
  alerts,
  queueOverrides,
  queuePlanItems,
  type JobRow,
} from "@/lib/db/schema";
import {
  expectedPiecesPerPallet,
  requiresUnderPlanComment,
} from "@/lib/queue/actual-pace";
import { rescheduleRemainingWeek } from "@/lib/queue/live-reschedule";
import {
  getRotationsAdminData,
  getActiveRotationMachineId,
} from "@/lib/queue/rotations";
import { resolveShopCode, sortShopCodes } from "@/lib/queue/shop-code";
import { getWorkNorms } from "@/lib/queue/work-norms";
import {
  scheduleQueue,
  recalculateLaneAssignments,
  jobPriority,
} from "@/lib/queue/schedule";
import { getLatestPlanRun } from "@/lib/queue/plan";
import {
  alignAiCommentsWithRebalance,
  analyzeRebalanceState,
  type RebalanceState,
} from "@/lib/queue/rebalance";
import { orderLaneJobsForDisplay } from "@/lib/queue/display-order";
import type { QueuePlanItemRow } from "@/lib/db/schema";
import {
  isJobStartInLockedPlanWeek,
  type LockedWeek,
} from "@/lib/queue/week";
import type { Machine as PlannerMachine, QueueJob as PlannerJob } from "@/lib/queue/types";
import {
  DEFAULT_CHANGEOVER_MINUTES,
  DEFAULT_ROTATION_HOURS,
  SHOP_MACHINE_ORDER,
} from "@/lib/queue/constants";
import {
  changeoverHoursFromSetup,
  getEffectiveMachineWidth,
  machineWidthHint,
  nextSetupWidthAfterJob,
} from "@/lib/queue/machine-width";
import { advanceWorkHours, durationHoursFromPlan } from "@/lib/queue/work-hours";
import type {
  QueueResponse,
  QueueWidthGroup,
  QueueLane,
  NextJobResponse,
  ShopJob,
  ConveyorInfo,
  AssignmentsResponse,
  Person,
  Machine as AdminMachine,
  JobScheduleInfo,
  QueueJob as ApiQueueJob,
  MachineCode,
  ClusterPriority,
} from "@/lib/production-types";
import type { PackagingOptions } from "@/lib/types";
import { defaultPackaging } from "@/lib/types";

export interface QueuedJob extends JobRow {
  tileName: string;
  tileQuantityPerPallet: number;
  proposalNumber: string;
  clientName: string;
  object: string;
  address: string;
  pjovimas: string;
  packaging: PackagingOptions;
}

interface BuiltSchedule {
  assignments: ReturnType<typeof scheduleQueue>;
  machineRows: (typeof machines.$inferSelect)[];
  machineCodeById: Map<string, MachineCode>;
  machineById: Map<string, typeof machines.$inferSelect>;
  assignmentMap: Map<string, ReturnType<typeof scheduleQueue>[number]>;
  jobRows: QueuedJob[];
  lockedWeek: LockedWeek | null;
  laterLockedCount: number;
  aiComments: string[];
  aiSource: "claude" | "mock" | null;
  planRunId: string | null;
  planStatus: "ready" | "accepted" | null;
  planItemByJob: Map<string, QueuePlanItemRow>;
  moveReasonByJob: Map<string, string>;
  rebalanceState: RebalanceState | null;
}

function sanitizeAiComments(
  comments: string[],
  source: "claude" | "mock" | null,
): string[] {
  if (source !== "mock") return comments;
  return comments.filter(
    (comment) =>
      !comment.includes("ANTHROPIC_API_KEY") &&
      !comment.includes("AI_GATEWAY_API_KEY") &&
      !/gateway neprijungtas|claude neprijungtas/i.test(comment),
  );
}

function parsePackaging(json: string): PackagingOptions {
  try {
    return { ...defaultPackaging(), ...JSON.parse(json) };
  } catch {
    return defaultPackaging();
  }
}

async function loadQueuedJobs(): Promise<QueuedJob[]> {
  const statuses = ["queued", "in_progress"] as const;
  const rows = await db
    .select({
      job: jobs,
      tileName: tiles.name,
      tileQuantityPerPallet: tiles.quantityPerPallet,
      proposalNumber: proposals.number,
      clientName: proposals.clientName,
      object: proposals.object,
      address: proposals.address,
      pjovimas: proposals.pjovimas,
      packagingJson: proposals.packagingJson,
    })
    .from(jobs)
    .innerJoin(tiles, eq(jobs.tileId, tiles.id))
    .innerJoin(proposals, eq(jobs.proposalId, proposals.id))
    .where(inArray(jobs.status, [...statuses]))
    .orderBy(asc(jobs.deadline), asc(jobs.sortOrder));

  return rows.map((row) => ({
    ...row.job,
    tileName: row.tileName,
    tileQuantityPerPallet: row.tileQuantityPerPallet,
    proposalNumber: row.proposalNumber,
    clientName: row.clientName,
    object: row.object,
    address: row.address,
    pjovimas: row.pjovimas,
    packaging: parsePackaging(row.packagingJson),
  }));
}

function toPalletCount(job: QueuedJob): number {
  if (job.quantityUnit === "pallets") {
    return job.quantity;
  }
  if (job.tileQuantityPerPallet > 0) {
    return job.quantity / job.tileQuantityPerPallet;
  }
  return job.pieceCount;
}

function toPlannerMachines(
  machineRows: (typeof machines.$inferSelect)[],
): PlannerMachine[] {
  return machineRows.map((machine) => ({
    id: machine.id,
    currentWidthMm: machine.currentWidthMm ?? 0,
    dailyRatePieces: machine.dailyRate,
    changeoverMinutes: DEFAULT_CHANGEOVER_MINUTES,
    piecesPerDay: machine.piecesPerDay ?? undefined,
  }));
}

function toPlannerJobs(jobRows: QueuedJob[]): PlannerJob[] {
  return jobRows.map((job) => ({
    id: job.id,
    tileWidthMm: job.widthMm,
    storisMm: job.storisMm,
    quantityPallets: toPalletCount(job),
    pieceCount: job.pieceCount,
    deadline: job.deadline,
    cutType: job.pjovimas,
    proposalId: job.proposalId,
  }));
}

function machineJobsForMachine(
  built: BuiltSchedule,
  machineId: string,
): QueuedJob[] {
  return built.jobRows.filter((job) => {
    const assignment = built.assignmentMap.get(job.id);
    return assignment?.machineId === machineId;
  });
}

function machineShopCode(machine: typeof machines.$inferSelect): string {
  return resolveShopCode(machine.code, machine.shopCode);
}

function formatWaitHours(hours: number): string {
  if (hours <= 0.05) {
    return "iš karto";
  }
  if (hours < 1) {
    return `po ${Math.round(hours * 60)} min.`;
  }
  const rounded = Math.round(hours * 10) / 10;
  return `po ${rounded.toLocaleString("lt-LT")} val.`;
}

function buildAssignmentReason(
  job: QueuedJob,
  machine: (typeof machines.$inferSelect),
  assignment: ReturnType<typeof scheduleQueue>[number],
  machineById: Map<string, typeof machines.$inferSelect>,
): string {
  const thisCode = machine.code;
  const other = assignment.otherMachineId
    ? machineById.get(assignment.otherMachineId)
    : undefined;
  const otherCode = other?.code ?? assignment.otherMachineId;
  const thisStart = formatWaitHours(assignment.pickStartHours);
  const otherStart =
    assignment.otherStartHours != null
      ? formatWaitHours(assignment.otherStartHours)
      : null;

  if (assignment.pickCriterion === "p1") {
    return `P1: tas pats plotis ir storis — palikta ant ${thisCode} (${job.widthMm}×${job.storisMm} mm).`;
  }
  if (assignment.pickCriterion === "p2") {
    return `P2: tas pats plotis ${job.widthMm} mm (kitas storis) — ${thisCode}, kad neskiltų korekcija.`;
  }
  if (assignment.pickCriterion === "far" && otherCode) {
    return `Tuščios ${thisCode} gavo tolimiausią bloką nuo ${otherCode} (${job.widthMm} mm), ne kaimyninį mm.`;
  }
  if (assignment.pickCriterion === "width" && otherCode) {
    const setupMm = machine.currentWidthMm && machine.currentWidthMm > 0
      ? `${machine.currentWidthMm} mm`
      : "pagal eilę";
    return `Priskirta ${thisCode} (${setupMm}): plotis ${job.widthMm} mm artimesnis nei ant ${otherCode}. Eilėje pirmiau pjaunami artimesni pločiai.`;
  }
  if (assignment.pickCriterion === "rate") {
    const rate =
      machine.piecesPerDay != null && machine.piecesPerDay > 0
        ? `${machine.piecesPerDay.toLocaleString("lt-LT")} vnt./d.`
        : `${machine.dailyRate} pal./d. (legacy)`;
    return `Priskirta ${thisCode}: didesnis našumas (${rate}).`;
  }

  if (assignment.changeoverHours > 0) {
    return `Priskirta ${thisCode} pagal ankstesnę pradžią (${thisStart}); reikės reguliuoti į ${job.widthMm} mm (+${DEFAULT_CHANGEOVER_MINUTES} min.).`;
  }

  return `Priskirta ${thisCode} pagal ankstesnę pradžią (${thisStart}).`;
}

function computeRebalanceState(
  machineRows: (typeof machines.$inferSelect)[],
  lockedWeekItems: QueuePlanItemRow[],
  lockedWeek: LockedWeek | null,
  planStatus: "ready" | "accepted" | null,
): RebalanceState | null {
  if (!lockedWeek || planStatus !== "ready" || lockedWeekItems.length === 0) {
    return null;
  }

  const shopMachines = machineRows.filter((machine) =>
    (SHOP_MACHINE_ORDER as readonly string[]).includes(machine.code),
  );

  return analyzeRebalanceState(
    shopMachines.map((machine) => machine.id),
    lockedWeekItems.map((item) => ({
      jobId: item.jobId,
      machineId: item.machineId,
      widthMm: item.widthMm,
      plannedStart: item.plannedStart,
      plannedEnd: item.plannedEnd,
    })),
    shopMachines.map((machine) => ({
      id: machine.id,
      code: machine.code,
      currentWidthMm: machine.currentWidthMm,
    })),
    lockedWeek,
  );
}

const buildSchedule = cache(async (): Promise<BuiltSchedule | null> => {
  const [jobRows, machineRows] = await Promise.all([
    loadQueuedJobs(),
    db.select().from(machines).orderBy(asc(machines.code)),
  ]);

  if (jobRows.length === 0) {
    return {
      assignments: [],
      machineRows,
      machineCodeById: new Map(
        machineRows.map((machine) => [machine.id, machine.code]),
      ),
      machineById: new Map(machineRows.map((machine) => [machine.id, machine])),
      assignmentMap: new Map(),
      jobRows,
      lockedWeek: null,
      laterLockedCount: 0,
      aiComments: [],
      aiSource: null,
      planRunId: null,
      planStatus: null,
      planItemByJob: new Map(),
      moveReasonByJob: new Map(),
      rebalanceState: null,
    };
  }

  const machineCodeById = new Map(
    machineRows.map((machine) => [machine.id, machine.code as MachineCode]),
  );
  const machineById = new Map(machineRows.map((machine) => [machine.id, machine]));

  const latestRun = await getLatestPlanRun();
  let lockedWeek: LockedWeek | null = null;
  let laterLockedCount = 0;
  let aiComments: string[] = [];
  let aiSource: "claude" | "mock" | null = null;
  let planRunId: string | null = null;
  let planStatus: "ready" | "accepted" | null = null;
  let planItemByJob = new Map<string, QueuePlanItemRow>();
  let moveReasonByJob = new Map<string, string>();
  let lockedWeekItems: QueuePlanItemRow[] = [];

  if (latestRun) {
    planRunId = latestRun.id;
    planStatus =
      latestRun.status === "accepted"
        ? "accepted"
        : latestRun.status === "ready"
          ? "ready"
          : null;
    lockedWeek = {
      startIso: latestRun.lockedWeekStart,
      endIso: latestRun.lockedWeekEnd,
    };
    try {
      aiComments = sanitizeAiComments(
        JSON.parse(latestRun.aiCommentsJson) as string[],
        latestRun.aiSource === "claude" ? "claude" : "mock",
      );
    } catch {
      aiComments = [];
    }
    aiSource = latestRun.aiSource === "claude" ? "claude" : "mock";

    const activeJobIds = jobRows.map((job) => job.id);
    const week: LockedWeek = {
      startIso: latestRun.lockedWeekStart,
      endIso: latestRun.lockedWeekEnd,
    };

    const [activePlanItems, laterCountRow] = await Promise.all([
      activeJobIds.length > 0
        ? db
            .select()
            .from(queuePlanItems)
            .where(
              and(
                eq(queuePlanItems.runId, latestRun.id),
                inArray(queuePlanItems.jobId, activeJobIds),
              ),
            )
        : Promise.resolve([]),
      db
        .select({ value: count() })
        .from(queuePlanItems)
        .where(
          and(
            eq(queuePlanItems.runId, latestRun.id),
            eq(queuePlanItems.lockedWeek, false),
          ),
        ),
    ]);

    planItemByJob = new Map(
      activePlanItems.map((item) => [item.jobId, item]),
    );
    laterLockedCount = laterCountRow[0]?.value ?? 0;

    lockedWeekItems =
      planStatus === "ready"
        ? activePlanItems.filter((item) =>
            isJobStartInLockedPlanWeek(item.plannedStart, week),
          )
        : [];

    const overrideRows = await db
      .select()
      .from(queueOverrides)
      .where(eq(queueOverrides.runId, latestRun.id))
      .orderBy(desc(queueOverrides.createdAt));
    for (const row of overrideRows) {
      const planItem = planItemByJob.get(row.jobId);
      if (planItem && planItem.machineId !== row.toMachineId) {
        continue;
      }
      if (!moveReasonByJob.has(row.jobId)) {
        moveReasonByJob.set(row.jobId, row.reason);
      }
    }
  }

  const inProgressWithoutPlan = jobRows.filter(
    (job) => job.status === "in_progress" && !planItemByJob.has(job.id),
  );
  const assignments =
    planItemByJob.size === 0
      ? scheduleQueue(toPlannerMachines(machineRows), toPlannerJobs(jobRows))
      : inProgressWithoutPlan.length > 0
        ? scheduleQueue(
            toPlannerMachines(machineRows),
            toPlannerJobs(inProgressWithoutPlan),
          )
        : [];

  let assignmentMap: Map<string, ReturnType<typeof scheduleQueue>[number]>;
  if (planItemByJob.size > 0) {
    assignmentMap = new Map();
    for (const job of jobRows) {
      const item = planItemByJob.get(job.id);
      const machine = item ? machineById.get(item.machineId) : undefined;
      if (item && machine) {
        assignmentMap.set(job.id, assignmentFromPlanItem(item, job, machine));
      }
    }
    for (const assignment of assignments) {
      if (assignmentMap.has(assignment.jobId)) {
        continue;
      }
      const job = jobRows.find((row) => row.id === assignment.jobId);
      if (job?.status === "in_progress") {
        assignmentMap.set(assignment.jobId, assignment);
      }
    }
  } else {
    assignmentMap = new Map(
      assignments.map((assignment) => [assignment.jobId, assignment]),
    );
  }

  const rebalanceState = latestRun
    ? computeRebalanceState(
        machineRows,
        lockedWeekItems,
        lockedWeek,
        planStatus,
      )
    : null;

  return {
    assignments,
    machineRows,
    machineCodeById,
    machineById,
    assignmentMap,
    jobRows,
    lockedWeek,
    laterLockedCount,
    aiComments,
    aiSource,
    planRunId,
    planStatus,
    planItemByJob,
    moveReasonByJob,
    rebalanceState,
  };
});

function isJobVisibleInLockedWeek(
  job: QueuedJob,
  assignment: ReturnType<typeof scheduleQueue>[number],
  lockedWeek: LockedWeek,
  planItemByJob: Map<string, QueuePlanItemRow>,
): boolean {
  if (job.status === "in_progress") {
    return true;
  }
  const planItem = planItemByJob.get(job.id);
  const start =
    planItem?.plannedStart ??
    (assignment.estimatedStart instanceof Date
      ? assignment.estimatedStart.toISOString()
      : String(assignment.estimatedStart));
  return isJobStartInLockedPlanWeek(start, lockedWeek);
}

function toJobScheduleInfo(
  job: QueuedJob,
  assignment: ReturnType<typeof scheduleQueue>[number],
  machine: (typeof machines.$inferSelect),
  positionInQueue: number,
  assignmentReason: string,
  workNormPiecesPerDay?: number,
  moveReason?: string,
): JobScheduleInfo {
  const productionHours = assignment.durationHours - assignment.changeoverHours;
  const estimatedStartIso = assignment.estimatedStart.toISOString();
  const productionStartIso =
    assignment.changeoverHours > 0
      ? advanceWorkHours(
          assignment.estimatedStart,
          assignment.changeoverHours,
        ).toISOString()
      : estimatedStartIso;

  return {
    widthMm: job.widthMm,
    storisMm: job.storisMm,
    deadline: job.deadline,
    conveyorCode: machine.code as MachineCode,
    conveyorShopCode: machineShopCode(machine),
    conveyorName: machine.title,
    machineCurrentWidthMm: machine.currentWidthMm ?? 0,
    dailyRatePallets: machine.dailyRate,
    workNormPiecesPerDay,
    rotationHours: machine.rotationHours ?? DEFAULT_ROTATION_HOURS,
    changeoverMinutes: DEFAULT_CHANGEOVER_MINUTES,
    quantityPallets: toPalletCount(job),
    productionHours,
    changeoverHours: assignment.changeoverHours,
    durationHours: assignment.durationHours,
    estimatedStart: estimatedStartIso,
    productionStart: productionStartIso,
    estimatedEnd: assignment.estimatedEnd.toISOString(),
    positionInQueue,
    requiresChangeover: assignment.changeoverHours > 0,
    assignmentReason,
    moveReason,
    priority: assignment.priority,
    editable: false,
  };
}

function toApiQueueJob(
  job: QueuedJob,
  schedule?: JobScheduleInfo,
): ApiQueueJob {
  return {
    id: job.id,
    tileName: job.tileName,
    proposalNumber: job.proposalNumber,
    client: job.clientName,
    object: job.object,
    deadline: job.deadline,
    storisMm: job.storisMm,
    widthMm: job.widthMm,
    quantityPlanned: job.quantity,
    quantityUnit: job.quantityUnit as "pieces" | "pallets",
    conveyorCode: schedule?.conveyorCode,
    conveyorShopCode: schedule?.conveyorShopCode,
    schedule,
  };
}

function assignmentFromPlanItem(
  item: QueuePlanItemRow,
  job: QueuedJob,
  machine: (typeof machines.$inferSelect),
): ReturnType<typeof scheduleQueue>[number] {
  const estimatedStart = new Date(item.plannedStart);
  const estimatedEnd = new Date(item.plannedEnd);
  const durationHours = durationHoursFromPlan(estimatedStart, estimatedEnd);
  const jobWidth = item.widthMm || job.widthMm;

  return {
    jobId: item.jobId,
    machineId: item.machineId,
    proposalId: job.proposalId,
    cutType: "",
    tileWidthMm: jobWidth,
    storisMm: item.storisMm || job.storisMm,
    quantityPallets: toPalletCount(job),
    durationHours,
    changeoverHours: 0,
    estimatedStart,
    estimatedEnd,
    pickCriterion: "width",
    pickStartHours: 0,
    otherMachineId: null,
    otherStartHours: null,
    priority: (item.priority as ClusterPriority) ?? "P3",
  };
}

function toPlannerMachine(machine: (typeof machines.$inferSelect)): PlannerMachine {
  return {
    id: machine.id,
    currentWidthMm: machine.currentWidthMm ?? 0,
    dailyRatePieces: machine.dailyRate,
    changeoverMinutes: DEFAULT_CHANGEOVER_MINUTES,
    piecesPerDay: machine.piecesPerDay ?? undefined,
  };
}

export async function getScheduledQueue(): Promise<QueueResponse> {
  const empty: QueueResponse = {
    lanes: [],
    groups: [],
    lockedWeekStart: null,
    lockedWeekEnd: null,
    laterLockedCount: 0,
    aiComments: [],
    aiSource: null,
    planRunId: null,
    planStatus: null,
    rebalance: null,
    unassignedJobs: [],
  };
  const built = await buildSchedule();
  if (!built) {
    return empty;
  }

  const workNormRows = await getWorkNorms();
  const workNormByCode = new Map(
    workNormRows.map((norm) => [norm.machineCode as MachineCode, norm.minPiecesPerDay]),
  );

  const lanes: QueueLane[] = [];
  const grouped = new Map<number, QueueWidthGroup>();
  const orderedMachines = [...built.machineRows].sort((left, right) => {
    const codes = sortShopCodes([left.code, right.code]);
    return codes.indexOf(left.code) - codes.indexOf(right.code);
  });

  for (const machine of orderedMachines) {
    const machineJobs = built.jobRows
      .map((job) => {
        const assignment = built.assignmentMap.get(job.id);
        if (!assignment || assignment.machineId !== machine.id) {
          return null;
        }
        return { job, assignment };
      })
      .filter(
        (
          item,
        ): item is {
          job: QueuedJob;
          assignment: ReturnType<typeof scheduleQueue>[number];
        } => item !== null,
      );

    const visibleJobs = built.lockedWeek
      ? machineJobs.filter(({ job, assignment }) =>
          isJobVisibleInLockedWeek(
            job,
            assignment,
            built.lockedWeek!,
            built.planItemByJob,
          ),
        )
      : machineJobs;
    const laterOnLane = built.lockedWeek
      ? machineJobs.length - visibleJobs.length
      : 0;

    const storedWidthMm = machine.currentWidthMm ?? 0;
    const usePlanTimes = built.planItemByJob.size > 0;
    const ordered = orderLaneJobsForDisplay(visibleJobs, machine, usePlanTimes);
    const recalculated = usePlanTimes
      ? ordered.map(({ assignment }) => assignment)
      : recalculateLaneAssignments(
          ordered.map(({ job, assignment }) => ({ job, assignment })),
          toPlannerMachine(machine),
        );
    const machineCode = machine.code as MachineCode;
    const workNormPiecesPerDay =
      workNormByCode.get(machineCode) ?? machine.piecesPerDay ?? undefined;

    let setupWidthMm = storedWidthMm > 0 ? storedWidthMm : 0;
    const laneJobs: ApiQueueJob[] = ordered.map(({ job, assignment: _assignment }, index) => {
      let assignment = recalculated[index] ?? _assignment;
      const changeoverHours = changeoverHoursFromSetup(
        setupWidthMm,
        job.widthMm,
        DEFAULT_CHANGEOVER_MINUTES,
      );
      assignment = { ...assignment, changeoverHours };
      setupWidthMm = nextSetupWidthAfterJob(setupWidthMm, job.widthMm);
      const previousJob = index > 0 ? ordered[index - 1].job : null;
      const priority = jobPriority(
        { tileWidthMm: job.widthMm, storisMm: job.storisMm },
        previousJob
          ? { tileWidthMm: previousJob.widthMm, storisMm: previousJob.storisMm }
          : null,
        machine.currentWidthMm ?? 0,
      );
      const assignmentWithPriority = { ...assignment, priority };
      const assignmentReason = buildAssignmentReason(
        job,
        machine,
        assignmentWithPriority,
        built.machineById,
      );
      const schedule = toJobScheduleInfo(
        job,
        assignmentWithPriority,
        machine,
        index + 1,
        assignmentReason,
        workNormPiecesPerDay,
        built.moveReasonByJob.get(job.id),
      );
      schedule.editable = Boolean(
        built.lockedWeek &&
          isJobVisibleInLockedWeek(
            job,
            assignmentWithPriority,
            built.lockedWeek,
            built.planItemByJob,
          ),
      );
      const apiJob = toApiQueueJob(job, schedule);

      const widthGroup = grouped.get(job.widthMm) ?? { widthMm: job.widthMm, jobs: [] };
      widthGroup.jobs.push(apiJob);
      grouped.set(job.widthMm, widthGroup);

      return apiJob;
    });

    lanes.push({
      id: machine.id,
      code: machineCode,
      shopCode: machineShopCode(machine),
      name: machine.title,
      storedWidthMm,
      currentWidthMm: storedWidthMm,
      widthSource: storedWidthMm > 0 ? "stored" : "unset",
      widthHint:
        storedWidthMm > 0
          ? "Admin nustatymas — keičia tik operatorius"
          : "Nustatykite plotį konvejerių ekrane",
      dailyRatePallets: machine.dailyRate,
      workNormPiecesPerDay,
      rotationHours: machine.rotationHours ?? DEFAULT_ROTATION_HOURS,
      changeoverMinutes: DEFAULT_CHANGEOVER_MINUTES,
      jobs: laneJobs,
      laterJobCount: laterOnLane,
    });
  }

  const groups = [...grouped.values()].sort((a, b) => a.widthMm - b.widthMm);
  for (const group of groups) {
    group.jobs.sort((left, right) => {
      if (left.schedule && right.schedule) {
        const leftStart = new Date(left.schedule.estimatedStart).getTime();
        const rightStart = new Date(right.schedule.estimatedStart).getTime();
        if (leftStart !== rightStart) return leftStart - rightStart;
      }
      if (left.widthMm !== right.widthMm) return left.widthMm - right.widthMm;
      return new Date(left.deadline).getTime() - new Date(right.deadline).getTime();
    });
  }

  const rebalanceState = built.rebalanceState;
  const aiComments =
    rebalanceState != null
      ? alignAiCommentsWithRebalance(built.aiComments, rebalanceState)
      : built.aiComments;

  const unassignedJobs = built.jobRows
    .filter((job) => {
      if (job.status === "in_progress") {
        return false;
      }
      if (built.planItemByJob.size > 0) {
        return !built.planItemByJob.has(job.id);
      }
      return !built.assignmentMap.has(job.id);
    })
    .map((job) => toApiQueueJob(job));

  return {
    lanes,
    groups,
    lockedWeekStart: built.lockedWeek?.startIso ?? null,
    lockedWeekEnd: built.lockedWeek?.endIso ?? null,
    laterLockedCount: built.laterLockedCount,
    aiComments,
    aiSource: built.aiSource,
    planRunId: built.planRunId,
    planStatus: built.planStatus,
    rebalance: rebalanceState
      ? {
          canRebalance: rebalanceState.canRebalance,
          pendingMoveCount: rebalanceState.pendingMoveCount,
          reason: rebalanceState.reason,
        }
      : null,
    unassignedJobs,
  };
}

async function countLoggedQuantity(jobId: string): Promise<number> {
  const logs = await db
    .select()
    .from(palletLogs)
    .where(eq(palletLogs.jobId, jobId));
  return logs.reduce(
    (sum, log) => sum + (log.goodQuantity > 0 ? log.goodQuantity : log.quantity),
    0,
  );
}

export interface PalletLogInput {
  goodQuantity: number;
  defectQuantity: number;
  comment?: string;
}

function toShopJob(
  job: QueuedJob,
  quantityLogged: number,
  schedule?: JobScheduleInfo,
): ShopJob {
  const quantityPlanned =
    job.quantityUnit === "pallets" ? job.quantity : job.pieceCount;
  const remaining = Math.max(0, quantityPlanned - quantityLogged);

  return {
    id: job.id,
    tileName: job.tileName,
    proposalNumber: job.proposalNumber,
    storisMm: job.storisMm,
    quantityPlanned,
    quantityLogged,
    quantityUnit: job.quantityUnit as "pieces" | "pallets",
    remaining,
    packaging: job.packaging,
    client: job.clientName,
    object: job.object,
    address: job.address,
    pjovimas: job.pjovimas,
    schedule,
  };
}

async function resolveUserMachine(
  userId: string,
): Promise<(typeof machines.$inferSelect) | undefined> {
  const rotationMachineId = await getActiveRotationMachineId(userId);

  if (rotationMachineId) {
    const [rotationMachine] = await db
      .select()
      .from(machines)
      .where(eq(machines.id, rotationMachineId))
      .limit(1);
    if (rotationMachine) return rotationMachine;
  }

  const [assignment] = await db
    .select({ machine: machines })
    .from(machineAssignments)
    .innerJoin(machines, eq(machineAssignments.machineId, machines.id))
    .where(eq(machineAssignments.userId, userId))
    .limit(1);
  return assignment?.machine;
}

export interface LaneJobsForUser {
  conveyor: ConveyorInfo | null;
  jobs: ApiQueueJob[];
  lockedWeekStart: string | null;
  lockedWeekEnd: string | null;
}

export async function getLaneJobsForUser(userId: string): Promise<LaneJobsForUser> {
  const machine = await resolveUserMachine(userId);
  if (!machine) {
    return {
      conveyor: null,
      jobs: [],
      lockedWeekStart: null,
      lockedWeekEnd: null,
    };
  }

  const queue = await getScheduledQueue();
  const lane = queue.lanes.find((item) => item.code === machine.code);

  const conveyor: ConveyorInfo = {
    id: machine.id,
    code: machine.code as MachineCode,
    shopCode: machineShopCode(machine),
    name: machine.title,
    currentWidthMm: lane?.currentWidthMm ?? machine.currentWidthMm ?? 0,
    dailyRatePallets: machine.dailyRate,
    workNormPiecesPerDay: lane?.workNormPiecesPerDay,
    rotationHours: machine.rotationHours ?? DEFAULT_ROTATION_HOURS,
    changeoverMinutes: DEFAULT_CHANGEOVER_MINUTES,
  };

  return {
    conveyor,
    jobs: lane?.jobs ?? [],
    lockedWeekStart: queue.lockedWeekStart,
    lockedWeekEnd: queue.lockedWeekEnd,
  };
}

export async function getNextJobForUser(userId: string): Promise<NextJobResponse> {
  const machine = await resolveUserMachine(userId);

  if (!machine) {
    return { conveyor: null, job: null };
  }
  const queue = await getScheduledQueue();
  const lane = queue.lanes.find((item) => item.code === machine.code);

  const conveyor: ConveyorInfo = {
    id: machine.id,
    code: machine.code as MachineCode,
    shopCode: machineShopCode(machine),
    name: machine.title,
    currentWidthMm: lane?.currentWidthMm ?? machine.currentWidthMm ?? 0,
    dailyRatePallets: machine.dailyRate,
    workNormPiecesPerDay: lane?.workNormPiecesPerDay,
    rotationHours: machine.rotationHours ?? DEFAULT_ROTATION_HOURS,
    changeoverMinutes: DEFAULT_CHANGEOVER_MINUTES,
  };
  const nextQueued = lane?.jobs[0];

  if (!nextQueued?.id) {
    return { conveyor, job: null };
  }

  const allJobs = await loadQueuedJobs();
  const job = allJobs.find((item) => item.id === nextQueued.id);
  if (!job) {
    return { conveyor, job: null };
  }

  const quantityLogged = await countLoggedQuantity(job.id);
  return {
    conveyor,
    job: toShopJob(job, quantityLogged, nextQueued.schedule),
  };
}

export async function logJobPallet(
  jobId: string,
  userId: string,
  input: PalletLogInput,
): Promise<ShopJob> {
  const allJobs = await loadQueuedJobs();
  const job = allJobs.find((item) => item.id === jobId);
  if (!job) throw new Error("Darbas nerastas.");

  const goodQuantity = Math.max(0, Math.round(input.goodQuantity));
  const defectQuantity = Math.max(0, Math.round(input.defectQuantity));
  if (goodQuantity <= 0 && defectQuantity <= 0) {
    throw new Error("QUANTITY_REQUIRED");
  }

  const palletCount = toPalletCount(job);
  const expectedPerLog = expectedPiecesPerPallet(job.pieceCount, palletCount);
  if (
    requiresUnderPlanComment(goodQuantity, expectedPerLog) &&
    !input.comment?.trim()
  ) {
    throw new Error("COMMENT_REQUIRED");
  }

  await db.insert(palletLogs).values({
    id: crypto.randomUUID(),
    jobId,
    quantity: 1,
    goodQuantity,
    defectQuantity,
    comment: input.comment?.trim() || null,
    damaged: defectQuantity > 0,
    loggedAt: new Date().toISOString(),
    loggedById: userId,
  });

  const quantityLogged = await countLoggedQuantity(jobId);

  if (job.status === "queued") {
    await db
      .update(jobs)
      .set({
        status: "in_progress",
        startedAt: new Date().toISOString(),
        completedPieces: quantityLogged,
      })
      .where(eq(jobs.id, jobId));
  } else {
    await db
      .update(jobs)
      .set({ completedPieces: quantityLogged })
      .where(eq(jobs.id, jobId));
  }

  await rescheduleRemainingWeek();

  const queue = await getScheduledQueue();
  const schedule = queue.lanes
    .flatMap((lane) => lane.jobs)
    .find((queued) => queued.id === jobId)?.schedule;

  const refreshed = allJobs.find((item) => item.id === jobId) ?? job;
  return toShopJob(refreshed, quantityLogged, schedule);
}

export async function finishJob(
  jobId: string,
  userId: string,
  reason?: string,
): Promise<{ completionPercent: number; managerSignalSaved: boolean }> {
  const allJobs = await loadQueuedJobs();
  const job = allJobs.find((item) => item.id === jobId);
  if (!job) throw new Error("Darbas nerastas.");

  const quantityLogged = await countLoggedQuantity(jobId);
  const quantityPlanned =
    job.quantityUnit === "pallets" ? job.quantity : job.pieceCount;

  if (quantityLogged < quantityPlanned && !reason?.trim()) {
    throw new Error("REASON_REQUIRED");
  }

  const completionPercent =
    quantityPlanned > 0
      ? Math.round((quantityLogged / quantityPlanned) * 100)
      : 0;

  const managerSignalSaved = completionPercent < 90;

  if (managerSignalSaved) {
    await db.insert(alerts).values({
      id: crypto.randomUUID(),
      jobId,
      type: "under_90_percent",
      message:
        reason?.trim() ||
        `Darbas ${job.proposalNumber} užbaigtas su ${completionPercent} % plano.`,
      createdAt: new Date().toISOString(),
      acknowledged: false,
    });
  }

  await db
    .update(jobs)
    .set({
      status: "completed",
      completedPieces: quantityLogged,
      finishedAt: new Date().toISOString(),
    })
    .where(eq(jobs.id, jobId));

  await rescheduleRemainingWeek();

  return { completionPercent, managerSignalSaved };
}

export async function getAssignments(): Promise<AssignmentsResponse> {
  const [peopleRows, machineRows, assignmentRows, built, rotations] =
    await Promise.all([
    db
      .select()
      .from(users)
      .where(eq(users.role, "cechas"))
      .orderBy(asc(users.name)),
    db.select().from(machines).orderBy(asc(machines.code)),
    db.select().from(machineAssignments),
    buildSchedule(),
    getRotationsAdminData(),
  ]);

  const people: Person[] = peopleRows.map((person) => ({
    id: person.id,
    name: person.name,
  }));

  const assignedByMachine = new Map<string, string[]>();
  const useRotation = Boolean(rotations.activePeriod);

  if (useRotation) {
    for (const [machineId, personIds] of Object.entries(
      rotations.activeAssignments,
    )) {
      assignedByMachine.set(machineId, personIds);
    }
  } else {
    for (const assignment of assignmentRows) {
      const current = assignedByMachine.get(assignment.machineId) ?? [];
      current.push(assignment.userId);
      assignedByMachine.set(assignment.machineId, current);
    }
  }

  const adminMachines: AdminMachine[] = machineRows.map((machine) => {
    const machineJobs = built ? machineJobsForMachine(built, machine.id) : [];
    const effectiveWidth = getEffectiveMachineWidth(
      machine.currentWidthMm,
      machineJobs,
    );

    return {
      id: machine.id,
      code: machine.code as MachineCode,
      shopCode: machineShopCode(machine),
      name: machine.title,
      dailyRatePallets: machine.dailyRate,
      workNormPiecesPerDay: machine.piecesPerDay ?? 0,
      rotationHours: machine.rotationHours ?? DEFAULT_ROTATION_HOURS,
      currentWidthMm: effectiveWidth.widthMm,
      storedWidthMm: machine.currentWidthMm ?? 0,
      widthSource: effectiveWidth.source,
      widthHint: machineWidthHint(effectiveWidth),
      assignedPersonIds: assignedByMachine.get(machine.id) ?? [],
    };
  });

  return { people, machines: adminMachines, rotations };
}

export async function switchWorkerConveyor(
  userId: string,
  machineCode: MachineCode,
): Promise<NextJobResponse> {
  const data = await getAssignments();
  const target = data.machines.find((machine) => machine.code === machineCode);
  if (!target) throw new Error("Konvejeris nerastas.");

  const assignments = data.machines.flatMap((machine) =>
    machine.assignedPersonIds
      .filter((personId) => personId !== userId)
      .map((personId) => ({ personId, machineId: machine.id })),
  );
  assignments.push({ personId: userId, machineId: target.id });

  await saveAssignments(assignments);
  return getNextJobForUser(userId);
}

export async function saveAssignments(
  assignments: { personId: string; machineId: string }[],
): Promise<AssignmentsResponse> {
  await db.delete(machineAssignments);

  for (const assignment of assignments) {
    await db.insert(machineAssignments).values({
      userId: assignment.personId,
      machineId: assignment.machineId,
    });
  }

  return getAssignments();
}

export async function patchMachineSettings(
  machineId: string,
  patch: {
    dailyRatePallets?: number;
    workNormPiecesPerDay?: number;
    rotationHours?: number;
    currentWidthMm?: number;
    shopCode?: string;
  },
): Promise<AssignmentsResponse> {
  const [machine] = await db
    .select()
    .from(machines)
    .where(eq(machines.id, machineId))
    .limit(1);

  if (!machine) throw new Error("Konvejeris nerastas.");

  await db
    .update(machines)
    .set({
      dailyRate:
        patch.dailyRatePallets !== undefined
          ? patch.dailyRatePallets
          : machine.dailyRate,
      piecesPerDay:
        patch.workNormPiecesPerDay !== undefined
          ? patch.workNormPiecesPerDay
          : machine.piecesPerDay,
      rotationHours:
        patch.rotationHours !== undefined
          ? patch.rotationHours
          : machine.rotationHours,
      currentWidthMm:
        patch.currentWidthMm !== undefined
          ? patch.currentWidthMm
          : machine.currentWidthMm,
      shopCode:
        patch.shopCode !== undefined
          ? patch.shopCode.trim() || null
          : machine.shopCode,
    })
    .where(eq(machines.id, machineId));

  return getAssignments();
}
