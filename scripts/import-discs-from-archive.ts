import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { db, initializeDatabase } from "../src/lib/db";
import { discs } from "../src/lib/db/schema";

const EXTRACT_DIR = path.join(process.cwd(), "data", "archive-import");
const DISCS_CSV = "export_All-Discs-modified_2026-09-28_08-26-58.csv";

function toInt(value: string | undefined, fallback = 0): number {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toFloat(value: string | undefined, fallback = 0): number {
  const parsed = Number.parseFloat(String(value ?? "").trim());
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function main(): Promise<void> {
  initializeDatabase();

  const filePath = path.join(EXTRACT_DIR, DISCS_CSV);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Nerastas archyvo failas: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, "utf8");
  const rows = parse(content, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  }) as Record<string, string>[];

  let count = 0;
  for (const row of rows) {
    const title = row.title?.trim();
    const id = row["unique id"]?.trim();
    if (!title || !id) continue;

    const diameterMm = toInt(row.diameter);
    const thicknessMm = toInt(row.thickness);
    const priceEur = toFloat(row.price);

    await db
      .insert(discs)
      .values({
        id,
        name: title,
        description: row.description?.trim() || null,
        diameterMm: diameterMm > 0 ? diameterMm : null,
        thicknessMm: thicknessMm > 0 ? thicknessMm : null,
        supplier: row.supplier?.trim() || "",
        priceEur: priceEur > 0 ? priceEur : null,
        workId: row["work-id"]?.trim() || null,
      })
      .onConflictDoUpdate({
        target: discs.id,
        set: {
          name: title,
          description: row.description?.trim() || null,
          diameterMm: diameterMm > 0 ? diameterMm : null,
          thicknessMm: thicknessMm > 0 ? thicknessMm : null,
          supplier: row.supplier?.trim() || "",
          priceEur: priceEur > 0 ? priceEur : null,
          workId: row["work-id"]?.trim() || null,
        },
      });
    count += 1;
  }

  console.log(JSON.stringify({ discsImported: count }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
