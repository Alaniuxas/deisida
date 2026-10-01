import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { db } from "@/lib/db";
import { workNorms } from "@/lib/db/schema";
import type { MachineCode } from "@/lib/production-types";

const DEFAULT_NORMS: {
  machineCode: MachineCode;
  label: string;
  minPiecesPerDay: number;
  sourceRow: string;
}[] = [
  {
    machineCode: "KONV",
    label: "Plytų pjovimas plytelėmis – konvejeriu",
    minPiecesPerDay: 2700,
    sourceRow: "Plytų pjovimas plytelėmis – konvejeriu",
  },
  {
    machineCode: "KNEW",
    label: "Plytų pjovimas plytelėmis – staklytėm",
    minPiecesPerDay: 1700,
    sourceRow: "Plytų pjovimas plytelėmis – staklytėm",
  },
];

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

function matchNorm(rowText: string): (typeof DEFAULT_NORMS)[number] | null {
  const normalized = rowText.toLowerCase();
  if (normalized.includes("konvejer")) {
    return DEFAULT_NORMS.find((item) => item.machineCode === "KONV") ?? null;
  }
  if (normalized.includes("staklyt")) {
    return DEFAULT_NORMS.find((item) => item.machineCode === "KNEW") ?? null;
  }
  return null;
}

export function parseWorkNormsFromCsv(csvPath: string): typeof DEFAULT_NORMS {
  const content = fs.readFileSync(csvPath, "utf8");
  const rows = parse(content, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  }) as Record<string, string>[];

  const found = new Map<MachineCode, (typeof DEFAULT_NORMS)[number]>();

  for (const row of rows) {
    const label =
      row.label ??
      row.name ??
      row.title ??
      row["Darbo operacija"] ??
      row["Operacija"] ??
      Object.values(row)[0] ??
      "";
    const norm = matchNorm(label);
    if (!norm) continue;

    const minValue = findMinInRow(row);
    found.set(norm.machineCode, {
      ...norm,
      minPiecesPerDay: minValue ?? norm.minPiecesPerDay,
      sourceRow: label.trim() || norm.sourceRow,
    });
  }

  return DEFAULT_NORMS.map(
    (fallback) => found.get(fallback.machineCode) ?? fallback,
  );
}

export async function importWorkNorms(csvPath?: string): Promise<number> {
  const resolved = csvPath ?? resolveWorkNormsCsvPath();
  const norms = resolved ? parseWorkNormsFromCsv(resolved) : DEFAULT_NORMS;
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

export async function getWorkNorms() {
  return db.select().from(workNorms).orderBy(workNorms.machineCode);
}

export async function ensureWorkNorms(): Promise<void> {
  const existing = await db
    .select({ id: workNorms.id })
    .from(workNorms)
    .limit(1);
  if (existing.length === 0) {
    await importWorkNorms();
  }
}

export { DEFAULT_NORMS };
