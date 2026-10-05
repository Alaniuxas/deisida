import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import {
  createMachineDowntime,
  listMachineDowntimesWithCodes,
} from "@/lib/queue/machine-downtime";
import { rescheduleForMachineDowntime } from "@/lib/queue/live-reschedule";
import { formatDowntimeNotice } from "@/lib/queue/downtime-summary";

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

export async function GET() {
  try {
    await requireUser(["admin", "pardavimai"]);
    const rows = await listMachineDowntimesWithCodes();
    return jsonOk({ downtimes: rows });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser(["admin"]);
    const contentType = request.headers.get("content-type") ?? "";
    const isForm = isFormPost(contentType);
    let machineId = "";
    let startAt = "";
    let endAt = "";
    let reason = "";
    let excludeJobIds: string[] = [];
    let acceptedLateJobIds: string[] = [];

    if (contentType.includes("application/json")) {
      const body = await request.json();
      machineId = String(body.machineId ?? "");
      startAt = String(body.startAt ?? "");
      endAt = String(body.endAt ?? "");
      reason = String(body.reason ?? "");
      excludeJobIds = Array.isArray(body.excludeJobIds)
        ? body.excludeJobIds.map(String)
        : [];
      acceptedLateJobIds = Array.isArray(body.acceptedLateJobIds)
        ? body.acceptedLateJobIds.map(String)
        : [];
    } else {
      const form = await request.formData();
      machineId = String(form.get("machineId") ?? "");
      startAt = String(form.get("startAt") ?? "");
      endAt = String(form.get("endAt") ?? "");
      reason = String(form.get("reason") ?? "");
    }

    if (!machineId || !startAt || !endAt) {
      if (isForm) {
        return redirectToPath("/eile?error=Gedimo%20laikas%20nenurodytas");
      }
      return jsonError("Pasirinkite staklę ir gedimo laiką.");
    }

    const downtime = await createMachineDowntime({
      machineId,
      startAt: new Date(startAt).toISOString(),
      endAt: new Date(endAt).toISOString(),
      reason,
      createdById: user.userId,
    });
    const reschedule = await rescheduleForMachineDowntime(undefined, {
      excludeJobIds,
    });

    if (isForm) {
      const notice = formatDowntimeNotice(reschedule?.downtimeMoves ?? []);
      return redirectToPath(`/eile?notice=${encodeURIComponent(notice)}`);
    }

    const confirmedLateCount = acceptedLateJobIds.length;
    const notice = formatDowntimeNotice(reschedule?.downtimeMoves ?? [], {
      confirmedLateCount,
      manualJobCount: excludeJobIds.length,
    });

    return jsonOk({ downtime, reschedule, notice });
  } catch (error) {
    const contentType = request.headers.get("content-type") ?? "";
    if (isFormPost(contentType)) {
      return redirectToPath("/eile?error=Gedimo%20įrašymas%20nepavyko");
    }
    return handleApiError(error);
  }
}
