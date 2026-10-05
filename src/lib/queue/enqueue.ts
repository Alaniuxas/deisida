import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { jobs, machines, queuePlanItems, queueOverrides } from "@/lib/db/schema";
import { SHOP_MACHINE_ORDER } from "./constants";
import {
  getLatestPlanRun,
  getPlanItemsForRun,
  resyncPlanLanes,
} from "./plan";
import {
  buildMoveSuggestionsForJob,
  buildMoveSuggestionsFromContext,
  loadSuggestMoveContext,
  resolveBestLaneOrderForJob,
} from "./move-context";

export { buildMoveSuggestionsForJob, resolveBestLaneOrderForJob };
import {
  effectiveCutByDeadline,
  isDeadlineStaleInPlan,
} from "./format";

export interface EnqueueJobRow {
  id: string;
  widthMm: number;
  pieceCount: number;
  deadline: string;
  proposalNumber: string | null;
  quantity: number;
  quantityUnit: "pieces" | "pallets";
}

export interface PlannedJobRow extends EnqueueJobRow {
  machineId: string;
  machineCode: string;
  plannedStart: string;
  plannedEnd: string;
  deadlineWasAdjusted?: boolean;
}

async function suggestMachineForJob(
  jobId: string,
  cutByIso: string,
  runId?: string,
): Promise<{ machineId: string; machineCode: string } | null> {
  const run = runId ? { id: runId } : await getLatestPlanRun();
  if (!run) return null;

  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  if (!job) return null;

  const context = await loadSuggestMoveContext(run.id);
  const suggestions = buildMoveSuggestionsFromContext({ job, cutByIso, context });

  const pick =
    suggestions.find((row) => row.recommended) ??
    suggestions.find((row) => row.meetsDeadline) ??
    suggestions[0];
  if (!pick) return null;

  return { machineId: pick.machineId, machineCode: pick.machineCode };
}

export async function getUnassignedJobsForProposal(
  proposalId: string,
): Promise<EnqueueJobRow[]> {
  const run = await getLatestPlanRun();
  const proposalJobs = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.proposalId, proposalId), eq(jobs.status, "queued")));

  if (proposalJobs.length === 0) {
    return [];
  }

  const inPlan = new Set<string>();
  if (run) {
    const planItems = await getPlanItemsForRun(run.id);
    for (const item of planItems) {
      inPlan.add(item.jobId);
    }
  }

  return proposalJobs
    .filter((job) => !inPlan.has(job.id))
    .map((job) => ({
      id: job.id,
      widthMm: job.widthMm,
      pieceCount: job.pieceCount,
      deadline: job.deadline,
      proposalNumber: null,
      quantity: job.quantity,
      quantityUnit: job.quantityUnit as "pieces" | "pallets",
    }));
}

export async function getPlannedJobsForProposal(
  proposalId: string,
): Promise<PlannedJobRow[]> {
  const run = await getLatestPlanRun();
  if (!run) {
    return [];
  }

  const [proposalJobs, planItems, machineRows] = await Promise.all([
    db
      .select()
      .from(jobs)
      .where(
        and(
          eq(jobs.proposalId, proposalId),
          inArray(jobs.status, ["queued", "in_progress"]),
        ),
      ),
    getPlanItemsForRun(run.id),
    db.select().from(machines),
  ]);

  const machineCodeById = new Map(machineRows.map((row) => [row.id, row.code]));
  const planByJob = new Map(planItems.map((item) => [item.jobId, item]));

  return proposalJobs
    .filter((job) => planByJob.has(job.id))
    .map((job) => {
      const item = planByJob.get(job.id)!;
      return {
        id: job.id,
        widthMm: job.widthMm,
        pieceCount: job.pieceCount,
        deadline: job.deadline,
        proposalNumber: null,
        quantity: job.quantity,
        quantityUnit: job.quantityUnit as "pieces" | "pallets",
        machineId: item.machineId,
        machineCode: machineCodeById.get(item.machineId) ?? "?",
        plannedStart: item.plannedStart,
        plannedEnd: item.plannedEnd,
      };
    });
}

export async function normalizeStalePlannedDeadlines(
  planned: PlannedJobRow[],
): Promise<PlannedJobRow[]> {
  const updates: Array<Promise<unknown>> = [];
  const normalized = planned.map((job) => {
    if (!isDeadlineStaleInPlan(job.deadline, job.plannedEnd)) {
      return job;
    }
    const effective = effectiveCutByDeadline(job.deadline, job.plannedEnd);
    updates.push(
      db.update(jobs).set({ deadline: effective }).where(eq(jobs.id, job.id)),
    );
    return { ...job, deadline: effective, deadlineWasAdjusted: true };
  });

  if (updates.length > 0) {
    await Promise.all(updates);
  }

  return normalized;
}

export async function insertJobIntoPlan(
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
  if (run.status === "accepted") {
    return {
      ok: false,
      status: 400,
      error: "Planas patvirtintas — pirmiausia atverkite planą redagavimui.",
    };
  }

  const [job] = await db.select().from(jobs).where(eq(jobs.id, input.jobId)).limit(1);
  if (!job) {
    return { ok: false, status: 404, error: "Darbas nerastas." };
  }
  if (job.status !== "queued") {
    return { ok: false, status: 400, error: "Tik laukiančius darbus galima įterpti." };
  }

  const [existing] = await db
    .select()
    .from(queuePlanItems)
    .where(and(eq(queuePlanItems.runId, run.id), eq(queuePlanItems.jobId, input.jobId)))
    .limit(1);
  if (existing) {
    return { ok: false, status: 400, error: "Darbas jau plane." };
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

  const existingItems = await getPlanItemsForRun(run.id);
  const maxSort = existingItems.reduce(
    (max, item) => Math.max(max, item.sortOrder ?? 0),
    -1,
  );

  const cutNote = input.cutByIso ? ` iki ${input.cutByIso.slice(0, 10)}` : "";
  const storedReason = `${reason}${cutNote}`;

  await db.insert(queuePlanItems).values({
    id: crypto.randomUUID(),
    runId: run.id,
    jobId: input.jobId,
    machineId: input.machineId,
    plannedStart: run.lockedWeekStart,
    plannedEnd: run.lockedWeekStart,
    priority: "P1",
    lockedWeek: true,
    sortOrder: maxSort + 1,
    widthMm: job.widthMm,
    storisMm: job.storisMm,
  });

  await db.insert(queueOverrides).values({
    id: crypto.randomUUID(),
    runId: run.id,
    jobId: input.jobId,
    fromMachineId: null,
    toMachineId: input.machineId,
    fromStart: null,
    toStart: run.lockedWeekStart,
    reason: storedReason,
    userId: input.userId,
    createdAt: new Date().toISOString(),
  });

  await db
    .update(jobs)
    .set({ machineId: input.machineId })
    .where(eq(jobs.id, input.jobId));

  if (!options?.deferResync) {
    const laneOrder = input.cutByIso
      ? await resolveBestLaneOrderForJob(
          input.jobId,
          input.machineId,
          input.cutByIso,
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

export async function enqueueJobsIntoPlan(input: {
  jobIds: string[];
  machineIdByJob?: Record<string, string>;
  cutByIso: string;
  reason: string;
  userId: string;
  autoSuggest?: boolean;
}): Promise<
  | { ok: true; enqueued: number }
  | { ok: false; status: number; error: string }
> {
  const jobIds = [...new Set(input.jobIds.map((id) => id.trim()).filter(Boolean))];
  if (jobIds.length === 0) {
    return { ok: false, status: 400, error: "Nenurodyti darbai." };
  }

  const cutBy = new Date(input.cutByIso);
  if (Number.isNaN(cutBy.getTime())) {
    return { ok: false, status: 400, error: "Neteisinga pjovimo data." };
  }

  const run = await getLatestPlanRun();
  if (!run) {
    return { ok: false, status: 400, error: "Nėra sugeneruoto savaitės plano." };
  }
  if (run.status === "accepted") {
    return {
      ok: false,
      status: 400,
      error: "Planas patvirtintas — pirmiausia atverkite planą redagavimui.",
    };
  }

  const laneOrderByMachine = new Map<string, string[]>();

  for (const jobId of jobIds) {
    let machineId = input.machineIdByJob?.[jobId]?.trim();
    if (!machineId && input.autoSuggest !== false) {
      const suggestion = await suggestMachineForJob(jobId, input.cutByIso, run.id);
      if (!suggestion) {
        return {
          ok: false,
          status: 400,
          error: `Nepavyko parinkti staklės darbui (${jobId}).`,
        };
      }
      machineId = suggestion.machineId;
    }
    if (!machineId) {
      return { ok: false, status: 400, error: "Nurodykite staklę kiekvienam darbui." };
    }

    const result = await insertJobIntoPlan(
      {
        jobId,
        machineId,
        reason: input.reason,
        userId: input.userId,
        cutByIso: input.cutByIso,
      },
      { deferResync: true },
    );
    if (!result.ok) {
      return result;
    }

    const laneOrder = await resolveBestLaneOrderForJob(
      jobId,
      machineId,
      input.cutByIso,
      run.id,
    );
    if (laneOrder) {
      for (const [machine, order] of laneOrder) {
        laneOrderByMachine.set(machine, order);
      }
    }
  }

  await resyncPlanLanes(run.id, new Date(), {
    laneOrderByMachine:
      laneOrderByMachine.size > 0 ? laneOrderByMachine : undefined,
    priorityJobIds: laneOrderByMachine.size > 0 ? undefined : jobIds,
  });

  return { ok: true, enqueued: jobIds.length };
}
