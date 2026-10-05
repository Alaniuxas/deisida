import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  jobs,
  machines,
  proposals,
  queueOverrides,
  queuePlanItems,
  queuePlanRuns,
  tiles,
  type QueuePlanItemRow,
} from "@/lib/db/schema";
import { durationHoursFromPlan } from "./work-hours";
import { cutByIsoFromDate } from "./format";
import { scheduleQueue } from "./schedule";
import { ensureCuttingNorms, ensureShopMachines } from "./excel-norms";
import { auditQueuePlan } from "./ai-audit";
import {
  analyzeRebalanceState,
  buildRebalanceBuckets,
  describeRebalanceBlockers,
  findRebalanceMove,
  type RebalancePlanItem,
  type RebalanceState,
} from "./rebalance";
import { backfillIdleLanes } from "./backfill-idle-lanes";
import { plannerReferenceTime } from "./balance";
import { rescheduleAssignmentLanes } from "./reschedule-assignments";
import { resolveBestLaneOrderForJob } from "./move-context";
import { applyTemporalBalance } from "./temporal-balance";
import {
  isJobStartInLockedPlanWeek,
  isTimestampInLockedWeek,
  lockedWeekForPlanner,
  type LockedWeek,
} from "./week";
import { DEFAULT_CHANGEOVER_MINUTES, SHOP_MACHINE_ORDER } from "./constants";
import type {
  Assignment,
  Machine as PlannerMachine,
  QueueJob as PlannerJob,
} from "./types";

export interface PlanRunResult {
  runId: string;
  lockedWeek: LockedWeek;
  itemCount: number;
  lockedCount: number;
  aiComments: string[];
  aiSource: "claude" | "mock";
}

const STRESS_MACHINE_PIN = /^STRESS-(NK1|NK2|S4|SK1|S1|S2)-/;

function stressPinnedMachineId(
  proposalNumber: string,
  machineCodeToId: Map<string, string>,
): string | undefined {
  const match = STRESS_MACHINE_PIN.exec(proposalNumber);
  if (!match) {
    return undefined;
  }
  return machineCodeToId.get(match[1]);
}

/** Užrakina staklę: STRESS demo, vykdomas darbas, nebaigtas darbas iš patvirtinto plano. */
export function resolvePinnedMachineId(input: {
  job: Pick<
    typeof jobs.$inferSelect,
    "status" | "machineId" | "completedPieces" | "pieceCount"
  >;
  proposalNumber: string;
  machineCodeToId: Map<string, string>;
  previousPlanItem?: Pick<
    QueuePlanItemRow,
    "machineId" | "lockedWeek"
  > | null;
  previousPlanAccepted?: boolean;
}): string | undefined {
  const stress = stressPinnedMachineId(
    input.proposalNumber,
    input.machineCodeToId,
  );
  if (stress) {
    return stress;
  }

  if (input.job.status === "in_progress" && input.job.machineId) {
    return input.job.machineId;
  }

  const unfinished = input.job.completedPieces < input.job.pieceCount;
  if (
    unfinished &&
    input.previousPlanAccepted &&
    input.previousPlanItem?.lockedWeek
  ) {
    return input.previousPlanItem.machineId;
  }

  return undefined;
}

function toPalletCount(
  quantity: number,
  quantityUnit: string,
  quantityPerPallet: number,
  pieceCount: number,
): number {
  if (quantityUnit === "pallets") return quantity;
  if (quantityPerPallet > 0) return quantity / quantityPerPallet;
  return pieceCount;
}

async function loadPlannerInput(): Promise<{
  plannerMachines: PlannerMachine[];
  plannerJobs: PlannerJob[];
  machineRows: (typeof machines.$inferSelect)[];
}> {
  await ensureShopMachines();
  await ensureCuttingNorms();

  const machineRows = await db.select().from(machines);
  const machineCodeToId = new Map(
    machineRows.map((machine) => [machine.code, machine.id]),
  );
  const jobRows = await db
    .select({
      job: jobs,
      quantityPerPallet: tiles.quantityPerPallet,
      proposalNumber: proposals.number,
    })
    .from(jobs)
    .innerJoin(tiles, eq(jobs.tileId, tiles.id))
    .innerJoin(proposals, eq(proposals.id, jobs.proposalId));

  const openJobs = jobRows.filter(
    (row) => row.job.status === "queued" || row.job.status === "in_progress",
  );

  const latestRun = await getLatestPlanRun();
  const previousPlanItems = latestRun
    ? await getPlanItemsForRun(latestRun.id)
    : [];
  const previousPlanItemByJob = new Map(
    previousPlanItems.map((item) => [item.jobId, item]),
  );

  const plannerMachines: PlannerMachine[] = machineRows.map((machine) => ({
    id: machine.id,
    currentWidthMm: machine.currentWidthMm ?? 0,
    dailyRatePieces: machine.dailyRate,
    changeoverMinutes: DEFAULT_CHANGEOVER_MINUTES,
    piecesPerDay: machine.piecesPerDay ?? undefined,
  }));

  const plannerJobs: PlannerJob[] = openJobs.map((row) => ({
    id: row.job.id,
    tileWidthMm: row.job.widthMm,
    storisMm: row.job.storisMm,
    quantityPallets: toPalletCount(
      row.job.quantity,
      row.job.quantityUnit,
      row.quantityPerPallet,
      row.job.pieceCount,
    ),
    pieceCount: row.job.pieceCount,
    deadline: row.job.deadline,
    cutType: "",
    proposalId: row.job.proposalId,
    pinnedMachineId: resolvePinnedMachineId({
      job: row.job,
      proposalNumber: row.proposalNumber,
      machineCodeToId,
      previousPlanItem: previousPlanItemByJob.get(row.job.id),
      previousPlanAccepted: latestRun?.status === "accepted",
    }),
  }));

  return { plannerMachines, plannerJobs, machineRows };
}

export async function getLatestPlanRun() {
  const [run] = await db
    .select()
    .from(queuePlanRuns)
    .orderBy(desc(queuePlanRuns.generatedAt))
    .limit(1);
  return run ?? null;
}

export async function getPlanItemsForRun(runId: string) {
  return db
    .select()
    .from(queuePlanItems)
    .where(eq(queuePlanItems.runId, runId));
}

export async function runFridayQueuePlan(now = new Date()): Promise<PlanRunResult> {
  const { plannerMachines, plannerJobs, machineRows } = await loadPlannerInput();
  const lockedWeek = lockedWeekForPlanner(now);
  let assignments = scheduleQueue(plannerMachines, plannerJobs, {
    referenceTime: plannerReferenceTime(now, lockedWeek),
    lockedWeek,
    balanceLockedWeek: true,
  });

  const temporalMoves = applyTemporalBalance(
    assignments,
    machineRows.map((machine) => ({
      id: machine.id,
      code: machine.code,
      currentWidthMm: machine.currentWidthMm ?? 0,
    })),
    lockedWeek,
  );
  assignments = rescheduleAssignmentLanes(
    assignments,
    plannerMachines,
    plannerJobs,
    lockedWeek,
    now,
  );
  backfillIdleLanes(assignments, plannerMachines, plannerJobs, lockedWeek);
  assignments = rescheduleAssignmentLanes(
    assignments,
    plannerMachines,
    plannerJobs,
    lockedWeek,
    now,
  );

  const runId = crypto.randomUUID();
  const generatedAt = new Date().toISOString();
  const machineCodeById = new Map(
    machineRows.map((machine) => [machine.id, machine.code]),
  );

  const items = assignments.map((assignment, index) => {
    const locked = isJobStartInLockedPlanWeek(assignment.estimatedStart, lockedWeek);
    return {
      id: crypto.randomUUID(),
      runId,
      jobId: assignment.jobId,
      machineId: assignment.machineId,
      plannedStart: assignment.estimatedStart.toISOString(),
      plannedEnd: assignment.estimatedEnd.toISOString(),
      priority: assignment.priority,
      lockedWeek: locked,
      sortOrder: index,
      widthMm: assignment.tileWidthMm,
      storisMm: assignment.storisMm,
    };
  });

  const overrides = await db
    .select()
    .from(queueOverrides)
    .orderBy(desc(queueOverrides.createdAt))
    .limit(50);

  const audit = await auditQueuePlan(buildAuditInput({
    lockedWeek,
    machineRows,
    items,
    overrides,
    machineCodeById,
  }));

  await db.insert(queuePlanRuns).values({
    id: runId,
    generatedAt,
    lockedWeekStart: lockedWeek.startIso,
    lockedWeekEnd: lockedWeek.endIso,
    aiCommentsJson: JSON.stringify(audit.comments),
    aiSource: audit.source,
    status: "ready",
  });

  if (items.length > 0) {
    await db.insert(queuePlanItems).values(items);
    for (const job of plannerJobs) {
      const assignment = assignments.find((row) => row.jobId === job.id);
      if (!assignment) continue;
      await db
        .update(jobs)
        .set({ machineId: assignment.machineId })
        .where(eq(jobs.id, job.id));
    }
  }

  if (temporalMoves.length > 0) {
    await db.insert(queueOverrides).values(
      temporalMoves.map((move) => ({
        id: crypto.randomUUID(),
        runId,
        jobId: move.jobId,
        fromMachineId: move.fromMachineId,
        toMachineId: move.toMachineId,
        fromStart: move.fromStart,
        toStart: move.toStart,
        reason: move.reason,
        userId: null,
        createdAt: generatedAt,
      })),
    );
  }

  return {
    runId,
    lockedWeek,
    itemCount: items.length,
    lockedCount: items.filter((item) =>
      isJobStartInLockedPlanWeek(item.plannedStart, lockedWeek),
    ).length,
    aiComments: audit.comments,
    aiSource: audit.source,
  };
}

/**
 * Rebuild machine assignments and times on the latest plan run
 * (e.g. after downtime is cancelled).
 */
export async function replanActiveQueueRun(now = new Date()): Promise<number | null> {
  const run = await getLatestPlanRun();
  if (!run) {
    return null;
  }

  const lockedWeek: LockedWeek = {
    startIso: run.lockedWeekStart,
    endIso: run.lockedWeekEnd,
  };

  const { plannerMachines, plannerJobs, machineRows } = await loadPlannerInput();
  let assignments = scheduleQueue(plannerMachines, plannerJobs, {
    referenceTime: plannerReferenceTime(now, lockedWeek),
    lockedWeek,
    balanceLockedWeek: true,
  });

  applyTemporalBalance(
    assignments,
    machineRows.map((machine) => ({
      id: machine.id,
      code: machine.code,
      currentWidthMm: machine.currentWidthMm ?? 0,
    })),
    lockedWeek,
  );
  assignments = rescheduleAssignmentLanes(
    assignments,
    plannerMachines,
    plannerJobs,
    lockedWeek,
    now,
  );
  backfillIdleLanes(assignments, plannerMachines, plannerJobs, lockedWeek);
  assignments = rescheduleAssignmentLanes(
    assignments,
    plannerMachines,
    plannerJobs,
    lockedWeek,
    now,
  );

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
          eq(queuePlanItems.runId, run.id),
          eq(queuePlanItems.jobId, assignment.jobId),
        ),
      );
    await db
      .update(jobs)
      .set({ machineId: assignment.machineId })
      .where(eq(jobs.id, assignment.jobId));
  }

  await db
    .update(queuePlanRuns)
    .set({
      generatedAt: now.toISOString(),
      status: run.status === "accepted" ? "ready" : run.status,
    })
    .where(eq(queuePlanRuns.id, run.id));

  return assignments.length;
}

export async function applyQueueOverride(
  input: {
    jobId: string;
    machineId: string;
    reason: string;
    userId: string;
    cutByIso?: string;
  },
  options?: { deferResync?: boolean },
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const reason = input.reason.trim();
  if (!reason) {
    return { ok: false, status: 400, error: "Įrašykite priežastį." };
  }

  const run = await getLatestPlanRun();
  if (!run) {
    return { ok: false, status: 400, error: "Nėra sugeneruoto savaitės plano." };
  }

  const [item] = await db
    .select()
    .from(queuePlanItems)
    .where(
      and(eq(queuePlanItems.jobId, input.jobId), eq(queuePlanItems.runId, run.id)),
    )
    .limit(1);

  if (!item || item.runId !== run.id) {
    return { ok: false, status: 404, error: "Darbas plane nerastas." };
  }

  const [target] = await db
    .select()
    .from(machines)
    .where(eq(machines.id, input.machineId))
    .limit(1);
  if (!target) {
    return { ok: false, status: 404, error: "Staklės nerastos." };
  }

  if (input.cutByIso) {
    await db
      .update(jobs)
      .set({ deadline: input.cutByIso.slice(0, 10) })
      .where(eq(jobs.id, input.jobId));
  }

  const cutNote = input.cutByIso ? ` iki ${input.cutByIso.slice(0, 10)}` : "";
  const storedReason = `${reason}${cutNote}`;

  await db.insert(queueOverrides).values({
    id: crypto.randomUUID(),
    runId: run.id,
    jobId: input.jobId,
    fromMachineId: item.machineId,
    toMachineId: input.machineId,
    fromStart: item.plannedStart,
    toStart: item.plannedStart,
    reason: storedReason,
    userId: input.userId,
    createdAt: new Date().toISOString(),
  });

  await db
    .update(queuePlanItems)
    .set({ machineId: input.machineId })
    .where(eq(queuePlanItems.id, item.id));

  await db
    .update(jobs)
    .set({ machineId: input.machineId })
    .where(eq(jobs.id, input.jobId));

  if (!options?.deferResync) {
    const cutByIso =
      input.cutByIso ??
      (await db.select({ deadline: jobs.deadline }).from(jobs).where(eq(jobs.id, input.jobId)).limit(1))[0]
        ?.deadline;
    const laneOrder =
      cutByIso != null
        ? await resolveBestLaneOrderForJob(
            input.jobId,
            input.machineId,
            cutByIso.includes("T")
              ? cutByIso
              : cutByIsoFromDate(String(cutByIso).slice(0, 10)),
            run.id,
          )
        : null;
    await resyncPlanLanes(run.id, new Date(), {
      laneOrderByMachine: laneOrder ?? undefined,
      priorityJobIds: laneOrder ? undefined : [input.jobId],
    });
  }

  return { ok: true };
}

function planItemsToAssignments(
  items: QueuePlanItemRow[],
  jobById: Map<string, typeof jobs.$inferSelect>,
): Assignment[] {
  const assignments: Assignment[] = [];
  for (const item of items) {
    const job = jobById.get(item.jobId);
    if (!job) continue;
    const estimatedStart = new Date(item.plannedStart);
    const estimatedEnd = new Date(item.plannedEnd);
    const durationHours = durationHoursFromPlan(estimatedStart, estimatedEnd);
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
      estimatedStart,
      estimatedEnd,
      pickCriterion: "width",
      pickStartHours: 0,
      otherMachineId: null,
      otherStartHours: null,
      priority: (item.priority as Assignment["priority"]) ?? "P3",
    });
  }
  return assignments;
}

/** Perskaičiuoja visų staklių laikus, užpildo tuščias vietas darbais iš kitos savaitės. */
export async function resyncPlanLanes(
  runId: string,
  now = new Date(),
  options?: {
    priorityJobIds?: string[];
    laneOrderByMachine?: Map<string, string[]>;
  },
): Promise<number> {
  const [run] = await db
    .select()
    .from(queuePlanRuns)
    .where(eq(queuePlanRuns.id, runId))
    .limit(1);
  if (!run) {
    return 0;
  }

  const week: LockedWeek = {
    startIso: run.lockedWeekStart,
    endIso: run.lockedWeekEnd,
  };

  const [machineRows, items, jobRows] = await Promise.all([
    db.select().from(machines),
    db.select().from(queuePlanItems).where(eq(queuePlanItems.runId, runId)),
    db
      .select({ job: jobs })
      .from(jobs)
      .where(inArray(jobs.status, ["queued", "in_progress"])),
  ]);

  const jobById = new Map(jobRows.map((row) => [row.job.id, row.job]));
  const plannerMachines: PlannerMachine[] = machineRows.map((machine) => ({
    id: machine.id,
    currentWidthMm: machine.currentWidthMm ?? 0,
    dailyRatePieces: machine.dailyRate,
    changeoverMinutes: DEFAULT_CHANGEOVER_MINUTES,
    piecesPerDay: machine.piecesPerDay ?? undefined,
  }));
  const plannerJobs: PlannerJob[] = jobRows.map((row) => ({
    id: row.job.id,
    tileWidthMm: row.job.widthMm,
    storisMm: row.job.storisMm,
    quantityPallets: 1,
    pieceCount: row.job.pieceCount,
    deadline: row.job.deadline,
    cutType: "",
    proposalId: row.job.proposalId,
  }));

  let assignments = planItemsToAssignments(items, jobById);
  backfillIdleLanes(assignments, plannerMachines, plannerJobs, week);
  const inProgressJobIds = jobRows
    .filter((row) => row.job.status === "in_progress")
    .map((row) => row.job.id);
  assignments = rescheduleAssignmentLanes(
    assignments,
    plannerMachines,
    plannerJobs,
    week,
    now,
    {
      priorityJobIds: options?.laneOrderByMachine
        ? undefined
        : options?.priorityJobIds,
      inProgressJobIds,
      laneOrderByMachine: options?.laneOrderByMachine,
    },
  );

  for (const assignment of assignments) {
    await db
      .update(queuePlanItems)
      .set({
        machineId: assignment.machineId,
        plannedStart: assignment.estimatedStart.toISOString(),
        plannedEnd: assignment.estimatedEnd.toISOString(),
        lockedWeek: isJobStartInLockedPlanWeek(assignment.estimatedStart, week),
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
  }

  return assignments.length;
}

async function auditCurrentRun(runId: string): Promise<{
  comments: string[];
  source: "claude" | "mock";
}> {
  const [run] = await db
    .select()
    .from(queuePlanRuns)
    .where(eq(queuePlanRuns.id, runId))
    .limit(1);
  if (!run) {
    return { comments: [], source: "mock" };
  }

  const lockedWeek: LockedWeek = {
    startIso: run.lockedWeekStart,
    endIso: run.lockedWeekEnd,
  };
  const machineRows = await db.select().from(machines);
  const machineCodeById = new Map(
    machineRows.map((machine) => [machine.id, machine.code]),
  );
  const items = await getPlanItemsForRun(runId);
  const overrides = await db
    .select()
    .from(queueOverrides)
    .where(eq(queueOverrides.runId, runId))
    .orderBy(desc(queueOverrides.createdAt))
    .limit(50);

  return auditQueuePlan(
    buildAuditInput({
      lockedWeek,
      machineRows,
      items,
      overrides,
      machineCodeById,
    }),
  );
}

function buildAuditInput(input: {
  lockedWeek: LockedWeek;
  machineRows: (typeof machines.$inferSelect)[];
  items: Array<{
    jobId: string;
    machineId: string;
    widthMm: number;
    storisMm: number;
    plannedStart: string;
    plannedEnd: string;
    lockedWeek: boolean;
  }>;
  overrides: Array<{
    jobId: string;
    fromMachineId: string | null;
    toMachineId: string | null;
    reason: string;
    createdAt: string;
  }>;
  machineCodeById: Map<string, string>;
}) {
  const shopMachines = input.machineRows.filter((machine) =>
    (SHOP_MACHINE_ORDER as readonly string[]).includes(machine.code),
  );
  const lockedItems: RebalancePlanItem[] = input.items
    .filter((item) =>
      isJobStartInLockedPlanWeek(item.plannedStart, input.lockedWeek),
    )
    .map((item) => ({
      jobId: item.jobId,
      machineId: item.machineId,
      widthMm: item.widthMm,
      plannedStart: item.plannedStart,
      plannedEnd: item.plannedEnd,
    }));

  return {
    lockedWeek: input.lockedWeek,
    jobs: input.items.map((item) => ({
      jobId: item.jobId,
      machineCode: input.machineCodeById.get(item.machineId) ?? item.machineId,
      widthMm: item.widthMm,
      storisMm: item.storisMm,
      plannedStart: item.plannedStart,
      plannedEnd: item.plannedEnd,
      lockedWeek: item.lockedWeek,
    })),
    overrides: input.overrides.map((row) => ({
      jobId: row.jobId,
      fromMachine: row.fromMachineId
        ? input.machineCodeById.get(row.fromMachineId) ?? row.fromMachineId
        : null,
      toMachine: row.toMachineId
        ? input.machineCodeById.get(row.toMachineId) ?? row.toMachineId
        : null,
      reason: row.reason,
      createdAt: row.createdAt,
    })),
    machineCodes: shopMachines.map((machine) => machine.code),
    machines: shopMachines.map((machine) => ({
      code: machine.code,
      currentWidthMm: machine.currentWidthMm,
    })),
    rebalanceState: analyzeRebalanceState(
      shopMachines.map((machine) => machine.id),
      lockedItems,
      shopMachines.map((machine) => ({
        id: machine.id,
        code: machine.code,
        currentWidthMm: machine.currentWidthMm,
      })),
      input.lockedWeek,
    ),
  };
}

export async function getRebalanceStateForLatestPlan(): Promise<RebalanceState | null> {
  const run = await getLatestPlanRun();
  if (!run || run.status === "accepted") {
    return null;
  }

  const machineRows = await db.select().from(machines);
  const shopMachines = machineRows.filter((machine) =>
    (SHOP_MACHINE_ORDER as readonly string[]).includes(machine.code),
  );
  const week: LockedWeek = {
    startIso: run.lockedWeekStart,
    endIso: run.lockedWeekEnd,
  };
  const items = (await getPlanItemsForRun(run.id)).filter((item) =>
    isJobStartInLockedPlanWeek(item.plannedStart, week),
  );

  return analyzeRebalanceState(
    shopMachines.map((machine) => machine.id),
    items.map((item) => ({
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
    week,
  );
}

export async function applyAutoRebalance(
  userId: string,
): Promise<
  | { ok: true; moved: number; message: string }
  | { ok: false; status: number; error: string }
> {
  const run = await getLatestPlanRun();
  if (!run) {
    return { ok: false, status: 400, error: "Nėra sugeneruoto savaitės plano." };
  }
  if (run.status === "accepted") {
    return { ok: false, status: 400, error: "Planas jau patvirtintas — redaguoti negalima." };
  }

  const machineRows = await db.select().from(machines);
  const shopIds = machineRows
    .filter((machine) =>
      (SHOP_MACHINE_ORDER as readonly string[]).includes(machine.code),
    )
    .map((machine) => machine.id);

  if (shopIds.length === 0) {
    return { ok: false, status: 400, error: "Staklių sąrašas tuščias." };
  }

  const week: LockedWeek = {
    startIso: run.lockedWeekStart,
    endIso: run.lockedWeekEnd,
  };
  const items = (await getPlanItemsForRun(run.id)).filter((item) =>
    isJobStartInLockedPlanWeek(item.plannedStart, week),
  );
  const lockedItems: RebalancePlanItem[] = items.map((item) => ({
    jobId: item.jobId,
    machineId: item.machineId,
    widthMm: item.widthMm,
    plannedStart: item.plannedStart,
    plannedEnd: item.plannedEnd,
  }));
  const buckets = buildRebalanceBuckets(shopIds, lockedItems);

  let moved = 0;
  let lastError = "";
  const machineById = new Map(
    machineRows.map((machine) => [
      machine.id,
      { code: machine.code, currentWidthMm: machine.currentWidthMm },
    ]),
  );

  for (let pass = 0; pass < items.length; pass += 1) {
    const move = findRebalanceMove(buckets, shopIds, machineById, week);
    if (!move) {
      break;
    }

    const { donorId, receiverId, candidate } = move;
    const donorItems = buckets.get(donorId)!;
    const receiverItems = buckets.get(receiverId)!;
    const planCandidate = items.find((item) => item.jobId === candidate.jobId);
    if (!planCandidate) {
      break;
    }

    const result = await applyQueueOverride(
      {
        jobId: candidate.jobId,
        machineId: receiverId,
        reason: "Automatinis perskirstymas pagal AI / apkrovos balansą",
        userId,
      },
      { deferResync: true },
    );
    if (!result.ok) {
      lastError = result.error;
      break;
    }

    donorItems.splice(
      donorItems.findIndex((item) => item.jobId === candidate.jobId),
      1,
    );
    receiverItems.push({ ...candidate, machineId: receiverId });
    const donorIndex = items.findIndex((item) => item.jobId === candidate.jobId);
    if (donorIndex >= 0) {
      items.splice(donorIndex, 1);
    }
    moved += 1;
  }

  if (moved === 0) {
    return {
      ok: false,
      status: 400,
      error:
        lastError ||
        describeRebalanceBlockers(buckets, shopIds, machineById, week).reason,
    };
  }

  await resyncPlanLanes(run.id);

  const audit = await auditCurrentRun(run.id);
  await db
    .update(queuePlanRuns)
    .set({
      aiCommentsJson: JSON.stringify(audit.comments),
      aiSource: audit.source,
      status: "ready",
    })
    .where(eq(queuePlanRuns.id, run.id));

  return {
    ok: true,
    moved,
    message: `Perkelta ${moved} darb. — peržiūrėkite atnaujintą planą.`,
  };
}

export async function acceptQueuePlan(): Promise<
  { ok: true } | { ok: false; status: number; error: string }
> {
  const run = await getLatestPlanRun();
  if (!run) {
    return { ok: false, status: 400, error: "Nėra sugeneruoto savaitės plano." };
  }

  await db
    .update(queuePlanRuns)
    .set({
      status: "accepted",
      aiCommentsJson: "[]",
    })
    .where(eq(queuePlanRuns.id, run.id));

  return { ok: true };
}

export async function reopenQueuePlan(): Promise<
  { ok: true } | { ok: false; status: number; error: string }
> {
  const run = await getLatestPlanRun();
  if (!run) {
    return { ok: false, status: 400, error: "Nėra sugeneruoto savaitės plano." };
  }
  if (run.status !== "accepted") {
    return { ok: false, status: 400, error: "Planas dar nebuvo patvirtintas." };
  }

  const audit = await auditCurrentRun(run.id);
  await db
    .update(queuePlanRuns)
    .set({
      status: "ready",
      aiCommentsJson: JSON.stringify(audit.comments),
      aiSource: audit.source,
    })
    .where(eq(queuePlanRuns.id, run.id));

  return { ok: true };
}
