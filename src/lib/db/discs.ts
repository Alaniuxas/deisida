import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { discs, type DiscRow } from "@/lib/db/schema";
import { slugify } from "@/lib/slugify";
import type { Disc } from "@/lib/types";

export interface CreateDiscInput {
  name: string;
  description?: string;
  diameterMm?: number;
  thicknessMm?: number;
  supplier?: string;
  priceEur?: number;
  workId?: string;
}

export interface UpdateDiscInput {
  name?: string;
  description?: string | null;
  diameterMm?: number | null;
  thicknessMm?: number | null;
  supplier?: string;
  priceEur?: number | null;
  workId?: string | null;
}

export function isBubbleDiscId(value: string): boolean {
  return /^\d+x\d+$/.test(value.trim());
}

export function discRowToDisc(row: DiscRow): Disc {
  return {
    id: row.id,
    name: row.name,
    description: row.description || undefined,
    diameterMm: row.diameterMm ?? undefined,
    thicknessMm: row.thicknessMm ?? undefined,
    supplier: row.supplier || undefined,
    priceEur: row.priceEur ?? undefined,
    workId: row.workId || undefined,
  };
}

export function formatDiscLabel(disc: Disc): string {
  const parts = [disc.name];
  if (disc.diameterMm) parts.push(`Ø${disc.diameterMm} mm`);
  if (disc.workId) parts.push(disc.workId);
  return parts.join(" · ");
}

export function resolveDiscLabel(
  discId: string | null | undefined,
  discText: string | null | undefined,
  discMap: Map<string, DiscRow>,
): string | undefined {
  if (discId && discMap.has(discId)) {
    return formatDiscLabel(discRowToDisc(discMap.get(discId)!));
  }
  const raw = discText?.trim();
  if (!raw) return undefined;
  if (isBubbleDiscId(raw) && discMap.has(raw)) {
    return formatDiscLabel(discRowToDisc(discMap.get(raw)!));
  }
  return raw;
}

export async function getDiscMapById(): Promise<Map<string, DiscRow>> {
  const rows = await db.select().from(discs);
  return new Map(rows.map((row) => [row.id, row]));
}

export async function getAllDiscs(): Promise<Disc[]> {
  const rows = await db.select().from(discs).orderBy(asc(discs.name));
  return rows.map(discRowToDisc);
}

export async function getDiscById(id: string): Promise<Disc | undefined> {
  const [row] = await db.select().from(discs).where(eq(discs.id, id)).limit(1);
  return row ? discRowToDisc(row) : undefined;
}

async function generateUniqueDiscId(name: string): Promise<string> {
  const base = slugify(name) || "disc";
  let candidate = base;
  let suffix = 2;
  while (await getDiscById(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

export async function createDisc(input: CreateDiscInput): Promise<Disc> {
  const name = input.name.trim();
  if (!name) {
    throw new Error("Disko pavadinimas privalomas.");
  }

  const id = await generateUniqueDiscId(name);
  const [row] = await db
    .insert(discs)
    .values({
      id,
      name,
      description: input.description?.trim() || null,
      diameterMm: input.diameterMm ?? null,
      thicknessMm: input.thicknessMm ?? null,
      supplier: (input.supplier ?? "").trim(),
      priceEur: input.priceEur ?? null,
      workId: input.workId?.trim() || null,
    })
    .returning();

  return discRowToDisc(row);
}

export async function updateDisc(id: string, input: UpdateDiscInput): Promise<Disc> {
  const existing = await getDiscById(id);
  if (!existing) {
    throw new Error("Diskas nerastas.");
  }

  const [row] = await db
    .update(discs)
    .set({
      name: input.name?.trim() || existing.name,
      description:
        input.description === undefined
          ? existing.description ?? null
          : input.description?.trim() || null,
      diameterMm:
        input.diameterMm === undefined ? existing.diameterMm ?? null : input.diameterMm,
      thicknessMm:
        input.thicknessMm === undefined ? existing.thicknessMm ?? null : input.thicknessMm,
      supplier:
        input.supplier === undefined ? (existing.supplier ?? "") : input.supplier.trim(),
      priceEur:
        input.priceEur === undefined ? existing.priceEur ?? null : input.priceEur,
      workId:
        input.workId === undefined ? existing.workId ?? null : input.workId?.trim() || null,
    })
    .where(eq(discs.id, id))
    .returning();

  return discRowToDisc(row);
}
