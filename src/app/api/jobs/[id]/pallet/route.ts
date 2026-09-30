import { requireUser } from "@/lib/auth";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { logJobPallet } from "@/lib/queue/service";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser(["admin", "cechas"]);
    const { id } = await context.params;
    const job = await logJobPallet(id, user.userId);
    return jsonOk(job);
  } catch (error) {
    if (error instanceof Error && error.message === "Darbas nerastas.") {
      return jsonError(error.message, 404);
    }
    return handleApiError(error);
  }
}
