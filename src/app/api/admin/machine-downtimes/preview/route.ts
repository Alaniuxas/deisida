import { requireUser } from "@/lib/auth";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { previewMachineDowntimeReschedule } from "@/lib/queue/live-reschedule";

export async function POST(request: Request) {
  try {
    await requireUser(["admin"]);
    const body = await request.json();
    const machineId = String(body.machineId ?? "");
    const startAt = String(body.startAt ?? "");
    const endAt = String(body.endAt ?? "");

    if (!machineId || !startAt || !endAt) {
      return jsonError("Pasirinkite staklę ir gedimo laiką.");
    }

    const preview = await previewMachineDowntimeReschedule({
      machineId,
      startAt: new Date(startAt).toISOString(),
      endAt: new Date(endAt).toISOString(),
    });

    if (!preview) {
      return jsonError("Nėra aktyvaus plano — paleiskite queue:plan.");
    }

    return jsonOk(preview);
  } catch (error) {
    return handleApiError(error);
  }
}
