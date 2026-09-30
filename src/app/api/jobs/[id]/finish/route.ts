import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { finishJob } from "@/lib/queue/service";

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

async function parseReason(request: Request): Promise<string | undefined> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const body = await request.json().catch(() => ({}));
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    return reason || undefined;
  }

  const form = await request.formData();
  const customReason = String(form.get("reason") ?? "").trim();
  const presetReason = String(form.get("reasonPreset") ?? "").trim();
  const combined = customReason || presetReason;
  return combined || undefined;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser(["admin", "cechas"]);
    const { id } = await context.params;
    const contentType = request.headers.get("content-type") ?? "";
    const reason = await parseReason(request);

    const result = await finishJob(id, user.userId, reason);

    if (isFormPost(contentType)) {
      if (result.managerSignalSaved) {
        return redirectToPath("/cechas?notice=manager");
      }
      return redirectToPath("/cechas?notice=finished");
    }

    return jsonOk({
      ok: true,
      completionPercent: result.completionPercent,
      managerSignalSaved: result.managerSignalSaved,
    });
  } catch (error) {
    const contentType = request.headers.get("content-type") ?? "";
    if (error instanceof Error && error.message === "Darbas nerastas.") {
      if (isFormPost(contentType)) {
        return redirectToPath("/cechas?error=notfound");
      }
      return jsonError(error.message, 404);
    }
    if (error instanceof Error && error.message === "REASON_REQUIRED") {
      if (isFormPost(contentType)) {
        return redirectToPath("/cechas?error=reason");
      }
      return jsonError(
        "Įrašykite priežastį, kodėl neužbaigėte viso plano.",
        400,
      );
    }
    if (isFormPost(contentType)) {
      return redirectToPath("/cechas?error=failed");
    }
    return handleApiError(error);
  }
}
