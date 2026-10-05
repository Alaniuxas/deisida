import fs from "node:fs";
import path from "node:path";
import { cache } from "react";
import { parse } from "csv-parse/sync";
import { db } from "@/lib/db";
import { workNorms } from "@/lib/db/schema";
import type { MachineCode } from "@/lib/production-types";

const CSV_CANDIDATES = [
  process.env.WORK_NORMS_CSV,
  "/home/ubuntu/.cursor/projects/workspace/uploads/Darbo_normos_Deisida_937b.csv",
  path.join(process.cwd(), "data", "Darbo_normos_Deisida.csv"),
].filter(Boolean) as string[];

export function resolveWorkNormsCsvPath(): string | null {
  for (const candidate of CSV_CANDIDATES) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function toInt(value: string | undefined): number | null {
  const parsed = Number.parseInt(String(value ?? "").replace(/\s/g, ""), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function findMinInRow(row: Record<string, string>): number | null {
  for (const [key, raw] of Object.entries(row)) {
    if (!/min/i.test(key)) continue;
    const value = toInt(raw);
    if (value !== null) return value;
  }
  return null;
}

/** Only the unique “plytelėmis – konvejeriu” row maps to KONV. Staklytėm is STAK, not KNEW. */
function matchKonvTileCutting(label: string): boolean {
  const normalized = label.toLowerCase().replace(/\s+/g, " ");
  return (
    normalized.includes("pjovimas plytelėmis") &&
    normalized.includes("konvejer")
  );
}

export function parseWorkNormsFromCsv(csvPath: string): {
  machineCode: MachineCode;
  label: string;
  minPiecesPerDay: number;
  sourceRow: string;
}[] {
  const raw = fs.readFileSync(csvPath, "utf8");
  const lines = raw.split(/\r?\n/);
  const headerIndex = lines.findIndex((line) =>
    line.startsWith("Darbo pavadinimas"),
  );
  const csvBody =
    headerIndex >= 0 ? lines.slice(headerIndex).join("\n") : raw;

  const rows = parse(csvBody, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  }) as Record<string, string>[];

  const found: {
    machineCode: MachineCode;
    label: string;
    minPiecesPerDay: number;
    sourceRow: string;
  }[] = [];

  for (const row of rows) {
    const label =
      row["Darbo pavadinimas"] ??
      row.label ??
      row.name ??
      row.title ??
      Object.values(row)[0] ??
      "";
    if (!matchKonvTileCutting(label)) continue;
    const minValue = findMinInRow(row);
    if (minValue == null) continue;
    found.push({
      machineCode: "KONV",
      label: label.trim(),
      minPiecesPerDay: minValue,
      sourceRow: label.trim(),
    });
    break;
  }

  return found;
}

export async function importWorkNorms(csvPath?: string): Promise<number> {
  const resolved = csvPath ?? resolveWorkNormsCsvPath();
  const norms = resolved ? parseWorkNormsFromCsv(resolved) : [];
  const importedAt = new Date().toISOString();

  await db.delete(workNorms);

  for (const norm of norms) {
    await db.insert(workNorms).values({
      id: `norm-${norm.machineCode.toLowerCase()}`,
      machineCode: norm.machineCode,
      label: norm.label,
      minPiecesPerDay: norm.minPiecesPerDay,
      unit: "pieces",
      sourceRow: norm.sourceRow,
      importedAt,
    });
  }

  return norms.length;
}

export const getWorkNorms = cache(async () => {
  return db.select().from(workNorms).orderBy(workNorms.machineCode);
});

export async function ensureWorkNorms(): Promise<void> {
  const existing = await db
    .select({ id: workNorms.id })
    .from(workNorms)
    .limit(1);
  if (existing.length === 0) {
    const { importCuttingNorms } = await import("./excel-norms");
    await importCuttingNorms();
  }
}
