import { asc, like, or } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { clients } from "@/lib/db/schema";
import { handleApiError, jsonOk } from "@/lib/api";

export async function GET(request: Request) {
  try {
    await requireUser(["admin", "pardavimai"]);
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q")?.trim() ?? "";

    const rows = query
      ? await db
          .select()
          .from(clients)
          .where(
            or(like(clients.name, `%${query}%`), like(clients.email, `%${query}%`)),
          )
          .orderBy(asc(clients.name))
          .limit(50)
      : await db.select().from(clients).orderBy(asc(clients.name)).limit(50);

    return jsonOk({ clients: rows });
  } catch (error) {
    return handleApiError(error);
  }
}
