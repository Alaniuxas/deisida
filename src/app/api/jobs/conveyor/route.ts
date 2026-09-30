import { requireUser } from "@/lib/auth";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { switchWorkerConveyor } from "@/lib/queue/service";
import type { MachineCode } from "@/lib/production-types";

export async function POST(request: Request) {
  try {
    const user = await requireUser(["admin", "cechas"]);
    const body = await request.json();
    const machineCode = String(body.machineCode ?? "").trim() as MachineCode;

    if (machineCode !== "KONV" && machineCode !== "KNEW") {
      return jsonError("Pasirinkite KONV arba KNEW.");
    }

    const next = await switchWorkerConveyor(user.userId, machineCode);
    return jsonOk(next);
  } catch (error) {
    return handleApiError(error);
  }
}
