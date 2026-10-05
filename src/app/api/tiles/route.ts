import { requireUser } from "@/lib/auth";
import { createTile, searchTiles } from "@/lib/db/tiles";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";

function parseOptionalPrice(value: unknown): number {
  if (value === undefined || value === null || value === "") {
    return 0;
  }
  const parsed =
    typeof value === "number"
      ? value
      : Number.parseFloat(String(value).trim().replace(",", "."));
  if (!Number.isFinite(parsed)) {
    throw new Error("Kaina turi būti skaičius.");
  }
  return parsed;
}

export async function GET(request: Request) {
  try {
    await requireUser();
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q") ?? "";
    const tiles = await searchTiles(query);
    return jsonOk({ tiles });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireUser(["admin", "pardavimai"]);
    const body = await request.json();

    if (!body?.name || typeof body.name !== "string") {
      return jsonError("Trūksta plytelės pavadinimo.");
    }

    const tile = await createTile({
      name: body.name,
      supplier: typeof body.supplier === "string" ? body.supplier : "",
      lengthMm: Number(body.lengthMm),
      widthMm: Number(body.widthMm),
      heightMm: Number(body.heightMm),
      priceEur: parseOptionalPrice(body.priceEur),
      discId:
        typeof body.discId === "string" && body.discId.trim() ? body.discId.trim() : null,
      hardness:
        body.hardness === undefined || body.hardness === null || body.hardness === ""
          ? null
          : Number.parseInt(String(body.hardness), 10),
      fragilityStrip:
        typeof body.fragilityStrip === "string" ? body.fragilityStrip : null,
      fragilityCorner:
        typeof body.fragilityCorner === "string" ? body.fragilityCorner : null,
      description: typeof body.description === "string" ? body.description : "",
    });

    return jsonOk({ tile }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}
