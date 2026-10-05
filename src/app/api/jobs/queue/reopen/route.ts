import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { reopenQueuePlan } from "@/lib/queue/plan";

export const dynamic = "force-dynamic";

function redirectToEile(query: string): NextResponse {
  return new NextResponse(null, {
    status: 303,
    headers: { Location: `/eile?${query}` },
  });
}

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  const formPost =
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data");

  try {
    await requireUser(["admin", "pardavimai"]);
    const result = await reopenQueuePlan();

    if (!result.ok) {
      if (formPost) {
        return redirectToEile(`error=${encodeURIComponent(result.error)}`);
      }
      return jsonError(result.error, result.status);
    }

    if (formPost) {
      return redirectToEile("reopened=1");
    }
    return jsonOk({ ok: true });
  } catch (error) {
    if (formPost) {
      return redirectToEile("error=failed");
    }
    return handleApiError(error);
  }
}
