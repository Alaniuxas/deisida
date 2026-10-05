import { cache } from "react";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { jobs, machines, queuePlanItems, queuePlanRuns } from "@/lib/db/schema";
import { SHOP_MACHINE_ORDER } from "./constants";
import {
  buildBestLaneSlot,
  type MoveLaneJob,
  type MoveTargetMachine,
  type MoveTargetSuggestion,
  suggestMoveTargets,
} from "./suggest-move";

const getLatestPlanRunCached = cache(async () => {
  const [run] = await db
    .select()
    .from(queuePlanRuns)
    .orderBy(desc(queuePlanRuns.generatedAt))
    .limit(1);
  return run ?? null;
});

async function getPlanRun(runId?: string) {
  if (runId) {
    return { id: runId };
  }
  return getLatestPlanRunCached();
}

export interface SuggestMoveContext {
  shopMachines: (typeof machines.$inferSelect)[];
  laneJobsByMachine: Map<string, MoveLaneJob[]>;
  planMachineByJobId: Map<string, string>;
}

export const loadSuggestMoveContext = cache(
  async (runId: string): Promise<SuggestMoveContext> => {
    const machineRows = await db.select().from(machines);
    const shopMachines = machineRows
      .filter((machine) =>
        (SHOP_MACHINE_ORDER as readonly string[]).includes(machine.code),
      )
      .sort(
        (left, right) =>
          SHOP_MACHINE_ORDER.indexOf(left.code as (typeof SHOP_MACHINE_ORDER)[number]) -
          SHOP_MACHINE_ORDER.indexOf(right.code as (typeof SHOP_MACHINE_ORDER)[number]),
      );

    const planItems = await db
      .select()
      .from(queuePlanItems)
      .where(eq(queuePlanItems.runId, runId));

    const jobIds = planItems.map((item) => item.jobId);
    const jobRows =
      jobIds.length > 0
        ? await db.select().from(jobs).where(inArray(jobs.id, jobIds))
        : [];
    const jobById = new Map(jobRows.map((row) => [row.id, row]));

    const laneJobsByMachine = new Map<string, MoveLaneJob[]>();
    const planMachineByJobId = new Map<string, string>();
    for (const item of planItems) {
      planMachineByJobId.set(item.jobId, item.machineId);
      const row = jobById.get(item.jobId);
      if (!row) continue;
      const list = laneJobsByMachine.get(item.machineId) ?? [];
      list.push({
        jobId: item.jobId,
        widthMm: item.widthMm || row.widthMm,
        pieceCount: row.pieceCount,
        quantityPallets: 1,
        estimatedStart: new Date(item.plannedStart),
        estimatedEnd: new Date(item.plannedEnd),
        status: row.status,
      });
      laneJobsByMachine.set(item.machineId, list);
    }

    for (const list of laneJobsByMachine.values()) {
      list.sort(
        (left, right) => left.estimatedStart.getTime() - right.estimatedStart.getTime(),
      );
    }

    return { shopMachines, laneJobsByMachine, planMachineByJobId };
  },
);

function toTargetMachines(
  shopMachines: (typeof machines.$inferSelect)[],
): MoveTargetMachine[] {
  return shopMachines.map((machine) => ({
    id: machine.id,
    code: machine.code,
    currentWidthMm: machine.currentWidthMm ?? 0,
    dailyRatePieces: machine.dailyRate,
    piecesPerDay: machine.piecesPerDay ?? undefined,
  }));
}

export function buildMoveSuggestionsFromContext(input: {
  job: typeof jobs.$inferSelect;
  cutByIso: string;
  context: SuggestMoveContext;
}): MoveTargetSuggestion[] {
  const fromMachineId =
    input.context.planMachineByJobId.get(input.job.id) ??
    input.job.machineId ??
    "";

  return suggestMoveTargets({
    movingJob: {
      jobId: input.job.id,
      widthMm: input.job.widthMm,
      pieceCount: input.job.pieceCount,
      quantityPallets: 1,
      fromMachineId,
    },
    cutByIso: input.cutByIso,
    machines: toTargetMachines(input.context.shopMachines),
    laneJobsByMachine: input.context.laneJobsByMachine,
  });
}

export async function buildMoveSuggestionsForJob(jobId: string, cutByIso: string) {
  const run = await getPlanRun();
  if (!run) {
    return null;
  }

  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  if (!job) {
    return null;
  }

  const context = await loadSuggestMoveContext(run.id);
  return buildMoveSuggestionsFromContext({ job, cutByIso, context });
}

export async function resolveBestLaneOrderForJob(
  jobId: string,
  machineId: string,
  cutByIso: string,
  runId?: string,
): Promise<Map<string, string[]> | null> {
  const run = await getPlanRun(runId);
  if (!run) return null;

  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  if (!job) return null;

  const { shopMachines, laneJobsByMachine } = await loadSuggestMoveContext(run.id);
  const machine = shopMachines.find((row) => row.id === machineId);
  if (!machine) return null;

  const laneJobs = laneJobsByMachine.get(machineId) ?? [];
  const slot = buildBestLaneSlot(
    {
      id: machine.id,
      code: machine.code,
      currentWidthMm: machine.currentWidthMm ?? 0,
      dailyRatePieces: machine.dailyRate,
      piecesPerDay: machine.piecesPerDay ?? undefined,
    },
    laneJobs,
    {
      jobId: job.id,
      widthMm: job.widthMm,
      pieceCount: job.pieceCount,
      quantityPallets: 1,
    },
    cutByIso,
  );

  return new Map([[machineId, slot.orderedJobIds]]);
}
