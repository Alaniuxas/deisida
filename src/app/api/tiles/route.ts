import { requireUser } from "@/lib/auth";
import { searchTiles } from "@/lib/db/tiles";
import { handleApiError, jsonOk } from "@/lib/api";

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
