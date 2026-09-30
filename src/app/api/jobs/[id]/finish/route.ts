import { requireUser } from "@/lib/auth";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { finishJob } from "@/lib/queue/service";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser(["admin", "cechas"]);
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const reason = typeof body.reason === "string" ? body.reason : undefined;

    const result = await finishJob(id, user.userId, reason);
    return jsonOk({
      ok: true,
      completionPercent: result.completionPercent,
      managerSignalSaved: result.managerSignalSaved,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Darbas nerastas.") {
      return jsonError(error.message, 404);
    }
    return handleApiError(error);
  }
}
