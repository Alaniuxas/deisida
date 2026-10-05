import { asc, eq, like, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { getDiscById, getDiscMapById, resolveDiscLabel } from "@/lib/db/discs";
import { tiles, type DiscRow, type TileRow } from "@/lib/db/schema";
import { slugify } from "@/lib/slugify";
import type { Tile } from "@/lib/types";

export interface CreateTileInput {
  name: string;
  supplier?: string;
  lengthMm: number;
  widthMm: number;
  heightMm: number;
  priceEur?: number;
  discId?: string | null;
  hardness?: number | null;
  fragilityStrip?: string | null;
  fragilityCorner?: string | null;
  description?: string;
}

export interface UpdateTileInput {
  name?: string;
  supplier?: string;
  lengthMm?: number;
  widthMm?: number;
  heightMm?: number;
  priceEur?: number;
  discId?: string | null;
  hardness?: number | null;
  fragilityStrip?: string | null;
  fragilityCorner?: string | null;
  description?: string;
}

function toPercentInput(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.endsWith("%") ? trimmed : `${trimmed}%`;
}

export function tileRowToTile(row: TileRow, discMap?: Map<string, DiscRow>): Tile {
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
    discId: row.discId || undefined,
    disc: resolveDiscLabel(row.discId, row.disc, discMap ?? new Map()),
    hardness: row.hardness ?? undefined,
    fragilityStrip: row.fragilityStrip || undefined,
    fragilityCorner: row.fragilityCorner || undefined,
  };
}

async function mapTileRows(rows: TileRow[]): Promise<Tile[]> {
  const discMap = await getDiscMapById();
  return rows.map((row) => tileRowToTile(row, discMap));
}

async function resolveDiscFields(discId: string | null | undefined): Promise<{
  discId: string | null;
  disc: string | null;
}> {
  if (!discId) {
    return { discId: null, disc: null };
  }
  const disc = await getDiscById(discId);
  if (!disc) {
    throw new Error("Pasirinktas diskas nerastas kataloge.");
  }
  const { formatDiscLabel } = await import("./discs");
  return { discId, disc: formatDiscLabel(disc) };
}

export async function getAllTiles(): Promise<Tile[]> {
  const rows = await db.select().from(tiles).orderBy(asc(tiles.name));
  return mapTileRows(rows);
}

export async function searchTiles(query: string, limit = 50): Promise<Tile[]> {
  const trimmed = query.trim();
  if (!trimmed) {
    const rows = await db.select().from(tiles).orderBy(asc(tiles.name)).limit(limit);
    return mapTileRows(rows);
  }

  const pattern = `%${trimmed}%`;
  const rows = await db
    .select()
    .from(tiles)
    .where(or(like(tiles.name, pattern), like(tiles.supplier, pattern)))
    .orderBy(asc(tiles.name))
    .limit(limit);

  return mapTileRows(rows);
}

export async function getTileByIdFromDb(id: string): Promise<Tile | undefined> {
  const [row] = await db.select().from(tiles).where(eq(tiles.id, id)).limit(1);
  if (!row) return undefined;
  const discMap = await getDiscMapById();
  return tileRowToTile(row, discMap);
}

async function generateUniqueTileId(name: string): Promise<string> {
  const base = slugify(name);
  if (!base) {
    throw new Error("Negalima sugeneruoti plytelės ID.");
  }

  let candidate = base;
  let suffix = 2;
  while (await getTileByIdFromDb(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

export async function createTile(input: CreateTileInput): Promise<Tile> {
  const name = input.name.trim();
  if (!name) {
    throw new Error("Plytelės pavadinimas privalomas.");
  }

  const lengthMm = Math.round(input.lengthMm);
  const widthMm = Math.round(input.widthMm);
  const heightMm = Math.round(input.heightMm);

  if (lengthMm <= 0 || widthMm <= 0 || heightMm <= 0) {
    throw new Error("Matmenys ir storis turi būti teigiami skaičiai.");
  }

  const priceEur = input.priceEur ?? 0;
  if (priceEur < 0) {
    throw new Error("Kaina negali būti neigiama.");
  }

  const supplier = (input.supplier ?? "").trim();
  const id = await generateUniqueTileId(name);
  const discFields = await resolveDiscFields(input.discId ?? null);

  const [row] = await db
    .insert(tiles)
    .values({
      id,
      bubbleId: null,
      name,
      supplier,
      manufacturer: "",
      priceEur,
      quantityPerPallet: 0,
      lengthMm,
      widthMm,
      heightMm,
      defaultStorisMm: heightMm,
      description: (input.description ?? "").trim(),
      discId: discFields.discId,
      disc: discFields.disc,
      hardness: input.hardness ?? null,
      fragilityStrip: toPercentInput(input.fragilityStrip),
      fragilityCorner: toPercentInput(input.fragilityCorner),
    })
    .returning();

  const discMap = await getDiscMapById();
  return tileRowToTile(row, discMap);
}

export async function updateTile(id: string, input: UpdateTileInput): Promise<Tile> {
  const existing = await getTileByIdFromDb(id);
  if (!existing) {
    throw new Error("Plytelė nerasta.");
  }

  const discFields =
    input.discId !== undefined
      ? await resolveDiscFields(input.discId)
      : { discId: existing.discId ?? null, disc: existing.disc ?? null };

  const [row] = await db
    .update(tiles)
    .set({
      name: input.name?.trim() || existing.name,
      supplier: input.supplier === undefined ? existing.supplier : input.supplier.trim(),
      lengthMm: input.lengthMm === undefined ? existing.lengthMm : Math.round(input.lengthMm),
      widthMm: input.widthMm === undefined ? existing.widthMm : Math.round(input.widthMm),
      heightMm: input.heightMm === undefined ? existing.heightMm : Math.round(input.heightMm),
      defaultStorisMm:
        input.heightMm === undefined
          ? existing.defaultStorisMm
          : Math.round(input.heightMm),
      priceEur: input.priceEur === undefined ? existing.priceEur : input.priceEur,
      description:
        input.description === undefined ? (existing.description ?? "") : input.description.trim(),
      discId: discFields.discId,
      disc: discFields.disc,
      hardness:
        input.hardness === undefined ? (existing.hardness ?? null) : input.hardness,
      fragilityStrip:
        input.fragilityStrip === undefined
          ? (existing.fragilityStrip ?? null)
          : toPercentInput(input.fragilityStrip),
      fragilityCorner:
        input.fragilityCorner === undefined
          ? (existing.fragilityCorner ?? null)
          : toPercentInput(input.fragilityCorner),
    })
    .where(eq(tiles.id, id))
    .returning();

  const discMap = await getDiscMapById();
  return tileRowToTile(row, discMap);
}
