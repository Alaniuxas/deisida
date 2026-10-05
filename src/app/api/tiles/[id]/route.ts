import { requireUser } from "@/lib/auth";
import { updateTile } from "@/lib/db/tiles";
import { handleApiError, jsonOk } from "@/lib/api";

function parseOptionalPrice(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed =
    typeof value === "number"
      ? value
      : Number.parseFloat(String(value).trim().replace(",", "."));
  if (!Number.isFinite(parsed)) {
    throw new Error("Kaina turi būti skaičius.");
  }
  return parsed;
}

function parseOptionalInt(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const parsed = Number.parseInt(String(value).trim(), 10);
  if (!Number.isFinite(parsed)) {
    throw new Error("Sveikasis skaičius turi būti teisingas.");
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

    const tile = await updateTile(id, {
      name: typeof body.name === "string" ? body.name : undefined,
      supplier: typeof body.supplier === "string" ? body.supplier : undefined,
      lengthMm: body.lengthMm === undefined ? undefined : Number(body.lengthMm),
      widthMm: body.widthMm === undefined ? undefined : Number(body.widthMm),
      heightMm: body.heightMm === undefined ? undefined : Number(body.heightMm),
      priceEur: parseOptionalPrice(body.priceEur),
      discId:
        body.discId === undefined
          ? undefined
          : typeof body.discId === "string" && body.discId.trim()
            ? body.discId.trim()
            : null,
      hardness: parseOptionalInt(body.hardness),
      fragilityStrip:
        body.fragilityStrip === undefined
          ? undefined
          : typeof body.fragilityStrip === "string"
            ? body.fragilityStrip
            : null,
      fragilityCorner:
        body.fragilityCorner === undefined
          ? undefined
          : typeof body.fragilityCorner === "string"
            ? body.fragilityCorner
            : null,
      description: typeof body.description === "string" ? body.description : undefined,
    });

    return jsonOk({ tile });
  } catch (error) {
    return handleApiError(error);
  }
}
