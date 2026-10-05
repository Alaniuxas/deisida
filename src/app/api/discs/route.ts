import { requireUser } from "@/lib/auth";
import { createDisc, getAllDiscs } from "@/lib/db/discs";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";

function parseOptionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed =
    typeof value === "number"
      ? value
      : Number.parseFloat(String(value).trim().replace(",", "."));
  if (!Number.isFinite(parsed)) {
    throw new Error("Skaičius turi būti teisingas.");
  }
  return parsed;
}

export async function GET() {
  try {
    await requireUser();
    const catalog = await getAllDiscs();
    return jsonOk({ discs: catalog });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireUser(["admin", "pardavimai"]);
    const body = await request.json();

    if (!body?.name || typeof body.name !== "string") {
      return jsonError("Trūksta disko pavadinimo.");
    }

    const disc = await createDisc({
      name: body.name,
      description: typeof body.description === "string" ? body.description : undefined,
      diameterMm: parseOptionalNumber(body.diameterMm),
      thicknessMm: parseOptionalNumber(body.thicknessMm),
      supplier: typeof body.supplier === "string" ? body.supplier : undefined,
      priceEur: parseOptionalNumber(body.priceEur),
      workId: typeof body.workId === "string" ? body.workId : undefined,
    });

    return jsonOk({ disc }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
