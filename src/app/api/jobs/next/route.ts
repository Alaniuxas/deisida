import { requireUser } from "@/lib/auth";
import { handleApiError, jsonOk } from "@/lib/api";
import { getNextJobForUser } from "@/lib/queue/service";

export async function GET() {
  try {
    const user = await requireUser(["admin", "cechas"]);
    const next = await getNextJobForUser(user.userId);
    return jsonOk(next);
  } catch (error) {
    return handleApiError(error);
  }
}
