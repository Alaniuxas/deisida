import { requireUser } from "@/lib/auth";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { patchMachineSettings } from "@/lib/queue/service";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser(["admin"]);
    const { id } = await context.params;
    const body = await request.json();

    const data = await patchMachineSettings(id, {
      dailyRatePallets:
        body.dailyRatePallets !== undefined
          ? Number(body.dailyRatePallets)
          : undefined,
      workNormPiecesPerDay:
        body.workNormPiecesPerDay !== undefined
          ? Number(body.workNormPiecesPerDay)
          : undefined,
      rotationHours:
        body.rotationHours !== undefined
          ? Number(body.rotationHours)
          : undefined,
      currentWidthMm:
        body.currentWidthMm !== undefined
          ? Number(body.currentWidthMm)
          : undefined,
      shopCode:
        body.shopCode !== undefined ? String(body.shopCode) : undefined,
    });

    return jsonOk(data);
  } catch (error) {
    if (error instanceof Error && error.message === "Konvejeris nerastas.") {
      return jsonError(error.message, 404);
    }
    return handleApiError(error);
  }
}
