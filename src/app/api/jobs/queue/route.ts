import { requireUser } from "@/lib/auth";
import { handleApiError, jsonOk } from "@/lib/api";
import { getScheduledQueue } from "@/lib/queue/service";

export async function GET() {
  try {
    await requireUser(["admin", "pardavimai", "cechas"]);
    const queue = await getScheduledQueue();
    return jsonOk(queue);
  } catch (error) {
    return handleApiError(error);
  }
}
