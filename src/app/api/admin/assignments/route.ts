import { requireUser } from "@/lib/auth";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { getAssignments, saveAssignments } from "@/lib/queue/service";

export async function GET() {
  try {
    await requireUser(["admin"]);
    const data = await getAssignments();
    return jsonOk(data);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireUser(["admin"]);
    const body = await request.json();
    const assignments = Array.isArray(body.assignments) ? body.assignments : null;
    if (!assignments) return jsonError("Trūksta priskyrimų.");

    const data = await saveAssignments(
      assignments.map((item: { personId: string; machineId: string }) => ({
        personId: String(item.personId),
        machineId: String(item.machineId),
      })),
    );
    return jsonOk(data);
  } catch (error) {
    return handleApiError(error);
  }
}
