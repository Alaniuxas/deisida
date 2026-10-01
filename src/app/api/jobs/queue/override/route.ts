import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { applyQueueOverride } from "@/lib/queue/plan";

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

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  const formPost = isFormPost(contentType);

  try {
    const user = await requireUser(["admin", "pardavimai"]);
    let jobId = "";
    let machineId = "";
    let reason = "";

    if (contentType.includes("application/json")) {
      const body = await request.json();
      jobId = String(body.jobId ?? "").trim();
      machineId = String(body.machineId ?? "").trim();
      reason = String(body.reason ?? "").trim();
    } else {
      const form = await request.formData();
      jobId = String(form.get("jobId") ?? "").trim();
      machineId = String(form.get("machineId") ?? "").trim();
      reason = String(form.get("reason") ?? "").trim();
    }

    const result = await applyQueueOverride({
      jobId,
      machineId,
      reason,
      userId: user.userId,
    });

    if (!result.ok) {
      if (formPost) {
        return redirectToPath(
          `/eile?error=${encodeURIComponent(result.error)}`,
        );
      }
      return jsonError(result.error, result.status);
    }

    if (formPost) {
      return redirectToPath("/eile?moved=1");
    }
    return jsonOk({ ok: true });
  } catch (error) {
    if (formPost) {
      return redirectToPath("/eile?error=failed");
    }
    return handleApiError(error);
  }
}
