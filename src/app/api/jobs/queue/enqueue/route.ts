import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { machines } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import {
  buildMoveSuggestionsForJob,
  enqueueJobsIntoPlan,
  insertJobIntoPlan,
} from "@/lib/queue/enqueue";
import { getLatestPlanRun } from "@/lib/queue/plan";
import { SHOP_MACHINE_ORDER } from "@/lib/queue/constants";

export const dynamic = "force-dynamic";

function redirectToPath(path: string): NextResponse {
  return new NextResponse(null, {
    status: 303,
    headers: { Location: path },
  });
}

function isFormPost(contentType: string): boolean {
  return (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  );
}

export async function GET(request: Request) {
  try {
    await requireUser(["admin", "pardavimai"]);
  } catch {
    return NextResponse.json({ error: "Neprisijungta." }, { status: 401 });
  }

  const url = new URL(request.url);
  const jobId = url.searchParams.get("jobId")?.trim();
  const cutBy = url.searchParams.get("cutBy")?.trim();
  if (!jobId || !cutBy) {
    return jsonError("Reikia jobId ir cutBy (ISO data).", 400);
  }

  const suggestions = await buildMoveSuggestionsForJob(jobId, cutBy);
  if (!suggestions) {
    return jsonError("Nėra savaitės plano arba darbas nerastas.", 400);
  }

  return jsonOk({ suggestions });
}

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  const formPost = isFormPost(contentType);

  try {
    const user = await requireUser(["admin", "pardavimai"]);
    let jobId = "";
    let machineId = "";
    let reason = "Įterpta į eilę";
    let cutByIso = "";
    let jobIds: string[] = [];

    if (contentType.includes("application/json")) {
      const body = await request.json();
      jobId = String(body.jobId ?? "").trim();
      machineId = String(body.machineId ?? "").trim();
      reason = String(body.reason ?? reason).trim();
      cutByIso = String(body.cutBy ?? body.cutByIso ?? "").trim();
      if (Array.isArray(body.jobIds)) {
        jobIds = body.jobIds.map((id: unknown) => String(id).trim()).filter(Boolean);
      }
    } else {
      const form = await request.formData();
      jobId = String(form.get("jobId") ?? "").trim();
      machineId = String(form.get("machineId") ?? "").trim();
      reason = String(form.get("reason") ?? reason).trim();
      cutByIso = String(form.get("cutBy") ?? "").trim();
    }

    const run = await getLatestPlanRun();
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

    if (jobIds.length > 0) {
      if (!cutByIso) {
        const message = "Nurodykite pjovimo terminą.";
        if (formPost) return redirectToPath(`/eile?error=${encodeURIComponent(message)}`);
        return jsonError(message, 400);
      }
      const result = await enqueueJobsIntoPlan({
        jobIds,
        cutByIso,
        reason,
        userId: user.userId,
      });
      if (!result.ok) {
        if (formPost) return redirectToPath(`/eile?error=${encodeURIComponent(result.error)}`);
        return jsonError(result.error, result.status);
      }
      if (formPost) return redirectToPath(`/eile?enqueued=${result.enqueued}`);
      return jsonOk({ ok: true, enqueued: result.enqueued, lanes, planStatus: run?.status ?? null });
    }

    if (!jobId || !machineId || !cutByIso) {
      const message = "Reikia jobId, machineId ir cutBy.";
      if (formPost) return redirectToPath(`/eile?error=${encodeURIComponent(message)}`);
      return jsonError(message, 400);
    }

    const result = await insertJobIntoPlan({
      jobId,
      machineId,
      reason,
      userId: user.userId,
      cutByIso,
    });

    if (!result.ok) {
      if (formPost) return redirectToPath(`/eile?error=${encodeURIComponent(result.error)}`);
      return jsonError(result.error, result.status);
    }

    if (formPost) return redirectToPath("/eile?enqueued=1");
    return jsonOk({ ok: true, enqueued: 1, lanes, planStatus: run?.status ?? null });
  } catch (error) {
    if (formPost) return redirectToPath("/eile?error=failed");
    return handleApiError(error);
  }
}
