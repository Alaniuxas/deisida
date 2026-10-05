import { requireUser } from "@/lib/auth";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import {
  createRotationPeriod,
  getRotationsAdminData,
  reassignRotation,
  updateRotationPeriod,
} from "@/lib/queue/rotations";

export async function GET() {
  try {
    await requireUser(["admin"]);
    const data = await getRotationsAdminData();
    return jsonOk(data);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser(["admin"]);
    const body = await request.json();

    const startDate = String(body.startDate ?? "").trim();
    if (!startDate) return jsonError("Nurodykite periodo pradžią.");

    const assignments = Array.isArray(body.assignments) ? body.assignments : [];
    const data = await createRotationPeriod({
      startDate,
      endDate: body.endDate ? String(body.endDate) : undefined,
      note: body.note ? String(body.note) : undefined,
      createdById: user.userId,
      assignments: assignments.map(
        (item: { personId: string; machineId: string | null }) => ({
          personId: String(item.personId),
          machineId: item.machineId ? String(item.machineId) : null,
        }),
      ),
    });

    return jsonOk(data);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireUser(["admin"]);
    const body = await request.json();

    const periodId = String(body.periodId ?? "").trim();
    if (!periodId) {
      return jsonError("Trūksta periodo.");
    }

    if (
      body.startDate !== undefined ||
      body.endDate !== undefined ||
      body.note !== undefined
    ) {
      const data = await updateRotationPeriod({
        periodId,
        startDate: body.startDate ? String(body.startDate) : undefined,
        endDate: body.endDate ? String(body.endDate) : undefined,
        note: body.note !== undefined ? String(body.note) : undefined,
        changedById: user.userId,
      });
      return jsonOk(data);
    }

    const personId = String(body.personId ?? "").trim();
    const reason = String(body.reason ?? "").trim();

    if (!personId) {
      return jsonError("Trūksta darbuotojo.");
    }

    const data = await reassignRotation({
      periodId,
      personId,
      machineId: body.machineId ? String(body.machineId) : null,
      reason,
      changedById: user.userId,
    });

    return jsonOk(data);
  } catch (error) {
    if (error instanceof Error && error.message === "REASON_REQUIRED") {
      return jsonError("Įrašykite priežastį: kodėl perkeliama?");
    }
    return handleApiError(error);
  }
}
