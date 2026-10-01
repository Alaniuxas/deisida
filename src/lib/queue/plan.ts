import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  jobs,
  machines,
  queueOverrides,
  queuePlanItems,
  queuePlanRuns,
  tiles,
} from "@/lib/db/schema";
import { plannerReferenceTime } from "./balance";
import { scheduleQueue } from "./schedule";
import { ensureCuttingNorms, ensureShopMachines } from "./excel-norms";
import { auditQueuePlan } from "./ai-audit";
import {
  isTimestampInLockedWeek,
  lockedWeekForPlanner,
  type LockedWeek,
} from "./week";
import { DEFAULT_CHANGEOVER_MINUTES } from "./constants";
import type { Machine as PlannerMachine, QueueJob as PlannerJob } from "./types";

export interface PlanRunResult {
  runId: string;
  lockedWeek: LockedWeek;
  itemCount: number;
  lockedCount: number;
  aiComments: string[];
  aiSource: "claude" | "mock";
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

  const [machineRows, jobRows] = await Promise.all([
    db.select().from(machines),
    db
      .select({
        job: jobs,
        quantityPerPallet: tiles.quantityPerPallet,
      })
      .from(jobs)
      .innerJoin(tiles, eq(jobs.tileId, tiles.id)),
  ]);

  const openJobs = jobRows.filter(
    (row) => row.job.status === "queued" || row.job.status === "in_progress",
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
  const assignments = scheduleQueue(plannerMachines, plannerJobs, {
    referenceTime: plannerReferenceTime(now, lockedWeek),
    lockedWeek,
    balanceLockedWeek: true,
  });

  const runId = crypto.randomUUID();
  const generatedAt = now.toISOString();
  const machineCodeById = new Map(
    machineRows.map((machine) => [machine.id, machine.code]),
  );

  const items = assignments.map((assignment, index) => {
    const locked = isTimestampInLockedWeek(assignment.estimatedStart, lockedWeek);
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

  const audit = await auditQueuePlan({
    lockedWeek,
    jobs: items.map((item) => ({
      jobId: item.jobId,
      machineCode: machineCodeById.get(item.machineId) ?? item.machineId,
      widthMm: item.widthMm,
      storisMm: item.storisMm,
      plannedStart: item.plannedStart,
      plannedEnd: item.plannedEnd,
      lockedWeek: item.lockedWeek,
    })),
    overrides: overrides.map((row) => ({
      jobId: row.jobId,
      fromMachine: row.fromMachineId
        ? machineCodeById.get(row.fromMachineId) ?? row.fromMachineId
        : null,
      toMachine: row.toMachineId
        ? machineCodeById.get(row.toMachineId) ?? row.toMachineId
        : null,
      reason: row.reason,
      createdAt: row.createdAt,
    })),
    machineCodes: machineRows.map((machine) => machine.code),
  });

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
  }

  return {
    runId,
    lockedWeek,
    itemCount: items.length,
    lockedCount: items.filter((item) => item.lockedWeek).length,
    aiComments: audit.comments,
    aiSource: audit.source,
  };
}

export async function applyQueueOverride(input: {
  jobId: string;
  machineId: string;
  reason: string;
  userId: string;
}): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const reason = input.reason.trim();
  if (!reason) {
    return { ok: false, status: 400, error: "Įrašykite priežastį." };
  }

  const run = await getLatestPlanRun();
  if (!run) {
    return { ok: false, status: 400, error: "Nėra sugeneruoto savaitės plano." };
  }

  const week: LockedWeek = {
    startIso: run.lockedWeekStart,
    endIso: run.lockedWeekEnd,
  };

  const [item] = await db
    .select()
    .from(queuePlanItems)
    .where(eq(queuePlanItems.jobId, input.jobId));

  if (!item || item.runId !== run.id) {
    return { ok: false, status: 404, error: "Darbas plane nerastas." };
  }

  if (!item.lockedWeek || !isTimestampInLockedWeek(item.plannedStart, week)) {
    return {
      ok: false,
      status: 403,
      error: "Keisti galima tik užrakintos savaitės darbus.",
    };
  }

  const [target] = await db
    .select()
    .from(machines)
    .where(eq(machines.id, input.machineId))
    .limit(1);
  if (!target) {
    return { ok: false, status: 404, error: "Staklės nerastos." };
  }

  await db.insert(queueOverrides).values({
    id: crypto.randomUUID(),
    runId: run.id,
    jobId: input.jobId,
    fromMachineId: item.machineId,
    toMachineId: input.machineId,
    fromStart: item.plannedStart,
    toStart: item.plannedStart,
    reason,
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

  return { ok: true };
}
