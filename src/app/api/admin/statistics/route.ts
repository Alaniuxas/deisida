import { requireUser } from "@/lib/auth";
import { handleApiError, jsonOk } from "@/lib/api";
import { getProductionStats } from "@/lib/queue/production-stats";

export async function GET(request: Request) {
  try {
    await requireUser(["admin"]);

    const url = new URL(request.url);
    const today = new Date().toISOString().slice(0, 10);
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    const dateFrom = url.searchParams.get("from") ?? weekAgo;
    const dateTo = url.searchParams.get("to") ?? today;
    const machineId = url.searchParams.get("machine") ?? undefined;
    const workerId = url.searchParams.get("worker") ?? undefined;

    const stats = await getProductionStats({
      dateFrom,
      dateTo,
      machineId: machineId || undefined,
      workerId: workerId || undefined,
    });
    return jsonOk(stats);
  } catch (error) {
    return handleApiError(error);
  }
}
