import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { logJobPallet } from "@/lib/queue/service";

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

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser(["admin", "cechas"]);
    const { id } = await context.params;
    const contentType = request.headers.get("content-type") ?? "";

    const job = await logJobPallet(id, user.userId);

    if (isFormPost(contentType)) {
      return redirectToPath("/cechas?notice=pallet");
    }

    return jsonOk(job);
  } catch (error) {
    const contentType = request.headers.get("content-type") ?? "";
    if (error instanceof Error && error.message === "Darbas nerastas.") {
      if (isFormPost(contentType)) {
        return redirectToPath("/cechas?error=notfound");
      }
      return jsonError(error.message, 404);
    }
    if (isFormPost(contentType)) {
      return redirectToPath("/cechas?error=failed");
    }
    return handleApiError(error);
  }
}
