import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { jobs, machines, proposals } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import {
  enqueueJobsIntoPlan,
  getPlannedJobsForProposal,
  getUnassignedJobsForProposal,
  normalizeStalePlannedDeadlines,
} from "@/lib/queue/enqueue";
import {
  buildMoveSuggestionsFromContext,
  loadSuggestMoveContext,
} from "@/lib/queue/move-context";
import { getLatestPlanRun } from "@/lib/queue/plan";
import { SHOP_MACHINE_ORDER } from "@/lib/queue/constants";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser(["admin", "pardavimai"]);
    const { id } = await context.params;

    const [proposal] = await db
      .select()
      .from(proposals)
      .where(eq(proposals.id, id))
      .limit(1);
    if (!proposal) {
      return jsonError("Pasiūlymas nerastas.", 404);
    }

    const run = await getLatestPlanRun();
    const [unassigned, plannedRaw] = await Promise.all([
      getUnassignedJobsForProposal(id),
      getPlannedJobsForProposal(id),
    ]);
    const planned = await normalizeStalePlannedDeadlines(plannedRaw);
    const machineRows = await db.select().from(machines);
    const lanes = machineRows
      .filter((machine) =>
        (SHOP_MACHINE_ORDER as readonly string[]).includes(machine.code),
      )
      .sort(
        (left, right) =>
          SHOP_MACHINE_ORDER.indexOf(left.code as (typeof SHOP_MACHINE_ORDER)[number]) -
          SHOP_MACHINE_ORDER.indexOf(right.code as (typeof SHOP_MACHINE_ORDER)[number]),
      )
      .map((machine) => ({ id: machine.id, label: machine.code }));

    const isActiveProposal =
      proposal.status === "confirmed" || proposal.status === "in_production";

    return jsonOk({
      proposal: {
        id: proposal.id,
        number: proposal.number,
        status: proposal.status,
        serviceDeadline: proposal.serviceDeadline,
      },
      planStatus: run?.status ?? null,
      canManage:
        Boolean(run) &&
        run?.status !== "accepted" &&
        isActiveProposal &&
        (unassigned.length > 0 || planned.length > 0),
      canEnqueue: Boolean(run) && run?.status !== "accepted" && unassigned.length > 0,
      unassignedJobs: unassigned.map((job) => ({
        ...job,
        proposalNumber: proposal.number,
      })),
      plannedJobs: planned.map((job) => ({
        ...job,
        proposalNumber: proposal.number,
      })),
      lanes,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser(["admin", "pardavimai"]);
    const { id } = await context.params;
    const body = await request.json();

    const [proposal] = await db
      .select()
      .from(proposals)
      .where(eq(proposals.id, id))
      .limit(1);
    if (!proposal) {
      return jsonError("Pasiūlymas nerastas.", 404);
    }
    if (proposal.status !== "confirmed" && proposal.status !== "in_production") {
      return jsonError("Į eilę galima įterpti tik patvirtintą pasiūlymą.", 400);
    }

    const cutByIso = String(body.cutBy ?? body.cutByIso ?? "").trim();
    if (!cutByIso) {
      return jsonError("Nurodykite pjovimo terminą.", 400);
    }

    const reason = String(body.reason ?? "Įterpta į eilę").trim();
    const unassigned = await getUnassignedJobsForProposal(id);
    if (unassigned.length === 0) {
      return jsonError("Visi pasiūlymo darbai jau plane.", 400);
    }

    const machineIdByJob: Record<string, string> = {};
    if (body.machineIdByJob && typeof body.machineIdByJob === "object") {
      for (const [jobId, machineId] of Object.entries(body.machineIdByJob)) {
        machineIdByJob[jobId] = String(machineId).trim();
      }
    } else if (body.machineId) {
      for (const job of unassigned) {
        machineIdByJob[job.id] = String(body.machineId).trim();
      }
    }

    const run = await getLatestPlanRun();
    const moveContext = run ? await loadSuggestMoveContext(run.id) : null;

    for (const job of unassigned) {
      if (machineIdByJob[job.id]) continue;
      if (!run || !moveContext) break;
      const [jobRow] = await db.select().from(jobs).where(eq(jobs.id, job.id)).limit(1);
      if (!jobRow) continue;
      const suggestions = buildMoveSuggestionsFromContext({
        job: jobRow,
        cutByIso,
        context: moveContext,
      });
      const recommended = suggestions.find((row) => row.recommended);
      if (recommended) {
        machineIdByJob[job.id] = recommended.machineId;
      }
    }

    const result = await enqueueJobsIntoPlan({
      jobIds: unassigned.map((job) => job.id),
      machineIdByJob,
      cutByIso,
      reason,
      userId: user.userId,
      autoSuggest: false,
    });

    if (!result.ok) {
      return jsonError(result.error, result.status);
    }

    return jsonOk({ ok: true, enqueued: result.enqueued });
  } catch (error) {
    return handleApiError(error);
  }
}
