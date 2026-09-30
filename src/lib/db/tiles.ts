import { asc, eq, like, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { tiles, type TileRow } from "@/lib/db/schema";
import type { Tile } from "@/lib/types";

export function tileRowToTile(row: TileRow): Tile {
  return {
    id: row.id,
    name: row.name,
    supplier: row.supplier,
    manufacturer: row.manufacturer || undefined,
    priceEur: row.priceEur,
    quantityPerPallet: row.quantityPerPallet,
    lengthMm: row.lengthMm,
    widthMm: row.widthMm,
    heightMm: row.heightMm,
    defaultStorisMm: row.defaultStorisMm,
    description: row.description || undefined,
    disc: row.disc || undefined,
    hardness: row.hardness ?? undefined,
    fragilityStrip: row.fragilityStrip || undefined,
    fragilityCorner: row.fragilityCorner || undefined,
  };
}

export async function getAllTiles(): Promise<Tile[]> {
  const rows = await db.select().from(tiles).orderBy(asc(tiles.name));
  return rows.map(tileRowToTile);
}

export async function searchTiles(query: string, limit = 50): Promise<Tile[]> {
  const trimmed = query.trim();
  if (!trimmed) {
    const rows = await db.select().from(tiles).orderBy(asc(tiles.name)).limit(limit);
    return rows.map(tileRowToTile);
  }

  const pattern = `%${trimmed}%`;
  const rows = await db
    .select()
    .from(tiles)
    .where(or(like(tiles.name, pattern), like(tiles.supplier, pattern)))
    .orderBy(asc(tiles.name))
    .limit(limit);

  return rows.map(tileRowToTile);
}

export async function getTileByIdFromDb(id: string): Promise<Tile | undefined> {
  const [row] = await db.select().from(tiles).where(eq(tiles.id, id)).limit(1);
  return row ? tileRowToTile(row) : undefined;
}
