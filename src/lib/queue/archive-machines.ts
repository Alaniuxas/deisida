import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { db } from "@/lib/db";
import { machines } from "@/lib/db/schema";
import type { MachineCode } from "@/lib/production-types";

export const ARCHIVE_MACHINES_CSV =
  "export_All-Machines-modified--_2026-09-28_08-28-42.csv";

const QUEUE_CODES: MachineCode[] = ["KONV", "KNEW"];

export interface ArchiveMachineRow {
  code: MachineCode;
  title: string;
  shopCode: string | null;
  dailyRate: number;
  idCodes: string[];
}

function toInt(value: string | undefined): number | null {
  const parsed = Number.parseInt(String(value ?? "").trim().replace(/\s/g, ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function dailyRateFromRow(row: Record<string, string>): number | null {
  return toInt(row.goal_daily_rate) ?? toInt(row.goal_daily_rate_per_employee);
}

export function parseQueueMachinesFromCsv(
  csvPath: string,
): ArchiveMachineRow[] {
  const content = fs.readFileSync(csvPath, "utf8");
  const rows = parse(content, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  }) as Record<string, string>[];

  const grouped = new Map<
    MachineCode,
    {
      titles: string[];
      idCodes: string[];
      dailyRates: number[];
    }
  >();

  for (const code of QUEUE_CODES) {
    grouped.set(code, { titles: [], idCodes: [], dailyRates: [] });
  }

  for (const row of rows) {
    const code = row.identifier?.trim() as MachineCode;
    if (!grouped.has(code)) continue;
    const bucket = grouped.get(code)!;
    const title = row.title?.trim();
    if (title) bucket.titles.push(title);
    const idCode = row["id-code"]?.trim();
    if (idCode) bucket.idCodes.push(idCode);
    const rate = dailyRateFromRow(row);
    if (rate != null) bucket.dailyRates.push(rate);
  }

  return QUEUE_CODES.map((code) => {
    const bucket = grouped.get(code)!;
    const uniqueIdCodes = [...new Set(bucket.idCodes)];
    const uniqueTitles = [...new Set(bucket.titles)];
    const fallbackTitle =
      code === "KONV" ? "Senas konvejeris" : "Naujas konvejeris";
    const fallbackRate = code === "KONV" ? 240 : 720;

    return {
      code,
      title: uniqueTitles[0] ?? fallbackTitle,
      shopCode: uniqueIdCodes.length === 1 ? uniqueIdCodes[0] : null,
      dailyRate: bucket.dailyRates[0] ?? fallbackRate,
      idCodes: uniqueIdCodes,
    };
  });
}

export function resolveArchiveMachinesCsvPath(): string | null {
  const candidates = [
    path.join(process.cwd(), "data", "archive-import", ARCHIVE_MACHINES_CSV),
    path.join(
      process.cwd(),
      "data",
      "archive-import",
      "export_All-Machines-modified--_2026-09-28_08-28-42.csv",
    ),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

export async function syncQueueMachinesFromArchive(
  csvPath?: string,
): Promise<ArchiveMachineRow[]> {
  const resolved = csvPath ?? resolveArchiveMachinesCsvPath();
  if (!resolved) {
    throw new Error("Machines CSV not found in data/archive-import.");
  }

  const parsed = parseQueueMachinesFromCsv(resolved);

  for (const row of parsed) {
    await db
      .insert(machines)
      .values({
        id: row.code,
        code: row.code,
        shopCode: row.shopCode,
        title: row.title,
        dailyRate: row.dailyRate,
        rotationHours: null,
        currentWidthMm: null,
      })
      .onConflictDoUpdate({
        target: machines.id,
        set: {
          title: row.title,
          shopCode: row.shopCode,
          dailyRate: row.dailyRate,
        },
      });
  }

  return parsed;
}
