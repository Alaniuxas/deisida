import { requireUser } from "@/lib/auth";
import { updateDisc } from "@/lib/db/discs";
import { handleApiError, jsonOk } from "@/lib/api";

function parseOptionalNumber(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const parsed =
    typeof value === "number"
      ? value
      : Number.parseFloat(String(value).trim().replace(",", "."));
  if (!Number.isFinite(parsed)) {
    throw new Error("Skaičius turi būti teisingas.");
  }
  return parsed;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser(["admin", "pardavimai"]);
    const { id } = await context.params;
    const body = await request.json();

    const disc = await updateDisc(id, {
      name: typeof body.name === "string" ? body.name : undefined,
      description:
        body.description === undefined
          ? undefined
          : typeof body.description === "string"
            ? body.description
            : null,
      diameterMm: parseOptionalNumber(body.diameterMm),
      thicknessMm: parseOptionalNumber(body.thicknessMm),
      supplier: typeof body.supplier === "string" ? body.supplier : undefined,
      priceEur: parseOptionalNumber(body.priceEur),
      workId:
        body.workId === undefined
          ? undefined
          : typeof body.workId === "string"
            ? body.workId
            : null,
    });

    return jsonOk({ disc });
  } catch (error) {
    return handleApiError(error);
  }
}
