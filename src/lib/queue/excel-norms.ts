import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { cuttingNorms, machines, workNorms } from "@/lib/db/schema";
import seed from "./cutting-norms.seed.json";
import { SHOP_MACHINE_ORDER } from "./constants";

export interface CuttingNormRecord {
  sheet: string;
  sourceRow: number;
  normCode: string;
  label: string;
  machineCode: string;
  minPiecesPerDay: number;
  minPiecesCalc: number | null;
}

export interface ShopMachineSeed {
  code: string;
  title: string;
  shopCode: string;
  piecesPerDay: number;
  dailyRatePallets: number;
}

export interface CuttingNormsFile {
  sourceFile: string;
  cuttingSheets: string[];
  skippedSheets: string[];
  machines: ShopMachineSeed[];
  norms: CuttingNormRecord[];
}

const XLSX_CANDIDATES = [
  process.env.CUTTING_NORMS_XLSX,
  "/home/ubuntu/.cursor/projects/workspace/uploads/2026.06.30_Deisida_normos_FINAL_f33f.xlsx",
  path.join(process.cwd(), "data", "2026.06.30_Deisida_normos_FINAL.xlsx"),
].filter(Boolean) as string[];

export function resolveCuttingNormsXlsxPath(): string | null {
  return XLSX_CANDIDATES.find((candidate) => fs.existsSync(candidate)) ?? null;
}

function toInt(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number.parseInt(String(value).replace(/\s/g, ""), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function toFloat(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number.parseFloat(String(value).toString().replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

const CUTTING_SHEETS = new Set(["PLY1", "PLY2"]);

export function parseCuttingNormsFromXlsx(xlsxPath: string): CuttingNormsFile {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const XLSX = require("xlsx") as typeof import("xlsx");
  const workbook = XLSX.readFile(xlsxPath, { cellDates: false });
  const skippedSheets = workbook.SheetNames.filter((name) => !CUTTING_SHEETS.has(name));
  const norms: CuttingNormRecord[] = [];

  for (const sheet of ["PLY1", "PLY2"]) {
    const worksheet = workbook.Sheets[sheet];
    if (!worksheet) continue;
    const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(worksheet, {
      header: 1,
      defval: null,
      raw: true,
    });
    for (let index = 1; index < rows.length; index += 1) {
      const row = rows[index] ?? [];
      const normCode = String(row[1] ?? "").trim();
      const label = String(row[2] ?? "").trim();
      const rawMachine = String(row[7] ?? "").trim();
      const machineCode =
        rawMachine && rawMachine !== "-" ? rawMachine.toUpperCase() : "";
      if (!normCode || !label || !machineCode) continue;
      const minPiecesPerDay = toInt(row[8]) ?? toInt(row[6]) ?? 0;
      norms.push({
        sheet,
        sourceRow: index + 1,
        normCode,
        label,
        machineCode,
        minPiecesPerDay,
        minPiecesCalc: toFloat(row[6]),
      });
    }
  }

  const byMachine = new Map<string, CuttingNormRecord[]>();
  for (const norm of norms) {
    const list = byMachine.get(norm.machineCode) ?? [];
    list.push(norm);
    byMachine.set(norm.machineCode, list);
  }

  const titles: Record<string, string> = {
    NK1: "NK1 — naujas konvejeris",
    NK2: "NK2 — naujas konvejeris",
    S1: "S1 — staklės",
    S2: "S2 — staklės",
    S4: "S4 — staklės",
    SK1: "SK1 — senas konvejeris",
  };
  const palletFallback: Record<string, number> = { NK1: 720, NK2: 720, SK1: 240 };

  const machineCodes = [
    ...SHOP_MACHINE_ORDER.filter((code) => byMachine.has(code)),
    ...[...byMachine.keys()].filter(
      (code) => !(SHOP_MACHINE_ORDER as readonly string[]).includes(code),
    ),
  ];

  const machineSeeds: ShopMachineSeed[] = machineCodes.map((code) => {
    const rowsForMachine = byMachine.get(code) ?? [];
    const plytelemis = rowsForMachine.find(
      (row) => row.label.toLowerCase() === "plytos pjovimas plytelėmis",
    );
    const anyPlytelemis = rowsForMachine.find((row) =>
      row.label.toLowerCase().includes("pjovimas plytelėmis"),
    );
    const maxPieces = Math.max(0, ...rowsForMachine.map((row) => row.minPiecesPerDay));
    return {
      code,
      title: titles[code] ?? code,
      shopCode: code,
      piecesPerDay: plytelemis?.minPiecesPerDay || anyPlytelemis?.minPiecesPerDay || maxPieces,
      dailyRatePallets: palletFallback[code] ?? 240,
    };
  });

  return {
    sourceFile: path.basename(xlsxPath),
    cuttingSheets: ["PLY1", "PLY2"],
    skippedSheets,
    machines: machineSeeds,
    norms,
  };
}

export function loadCuttingNormsFile(): CuttingNormsFile {
  const xlsxPath = resolveCuttingNormsXlsxPath();
  if (xlsxPath) {
    try {
      return parseCuttingNormsFromXlsx(xlsxPath);
    } catch {
      // fall through to committed seed
    }
  }
  return seed as CuttingNormsFile;
}

export async function ensureShopMachines(): Promise<void> {
  const file = loadCuttingNormsFile();
  const existing = await db.select().from(machines);

  for (const row of existing) {
    if (row.id === "KNEW" && row.code === "KNEW") {
      await db
        .update(machines)
        .set({
          code: "NK1",
          shopCode: "NK1",
          title: "NK1 — naujas konvejeris",
        })
        .where(eq(machines.id, "KNEW"));
    }
    if (row.id === "KONV" && row.code === "KONV") {
      await db
        .update(machines)
        .set({
          code: "SK1",
          shopCode: "SK1",
          title: "SK1 — senas konvejeris",
        })
        .where(eq(machines.id, "KONV"));
    }
  }

  const after = await db.select().from(machines);
  const byCode = new Set(after.map((row) => row.code));

  for (const machine of file.machines) {
    if (byCode.has(machine.code)) {
      await db
        .update(machines)
        .set({
          shopCode: machine.shopCode,
          title: machine.title,
          dailyRate: machine.dailyRatePallets,
          piecesPerDay: machine.piecesPerDay,
        })
        .where(eq(machines.code, machine.code));
      continue;
    }
    await db.insert(machines).values({
      id: machine.code,
      code: machine.code,
      shopCode: machine.shopCode,
      title: machine.title,
      dailyRate: machine.dailyRatePallets,
      piecesPerDay: machine.piecesPerDay,
      rotationHours: null,
      currentWidthMm: null,
    });
    byCode.add(machine.code);
  }
}

export async function importCuttingNorms(xlsxPath?: string): Promise<{
  machines: number;
  norms: number;
  skippedSheets: string[];
}> {
  const file = xlsxPath
    ? parseCuttingNormsFromXlsx(xlsxPath)
    : loadCuttingNormsFile();
  const importedAt = new Date().toISOString();

  await ensureShopMachines();
  await db.delete(cuttingNorms);
  await db.delete(workNorms);

  for (const [index, norm] of file.norms.entries()) {
    await db.insert(cuttingNorms).values({
      id: `cut-${norm.normCode}-${index}`,
      machineCode: norm.machineCode,
      label: norm.label,
      brickKey: norm.normCode,
      minPiecesPerDay: norm.minPiecesPerDay,
      unit: "pieces",
      sourceRow: `${norm.sheet}:${norm.sourceRow}`,
      sheet: norm.sheet,
      importedAt,
    });
  }

  for (const machine of file.machines) {
    if (machine.piecesPerDay <= 0) continue;
    await db.insert(workNorms).values({
      id: `norm-${machine.code.toLowerCase()}`,
      machineCode: machine.code,
      label: `${machine.code} pjovimas (Excel)`,
      minPiecesPerDay: machine.piecesPerDay,
      unit: "pieces",
      sourceRow: file.sourceFile,
      importedAt,
    });
  }

  return {
    machines: file.machines.length,
    norms: file.norms.length,
    skippedSheets: file.skippedSheets,
  };
}

export async function ensureCuttingNorms(): Promise<void> {
  await ensureShopMachines();
  const existing = await db
    .select({ id: cuttingNorms.id })
    .from(cuttingNorms)
    .limit(1);
  if (existing.length === 0) {
    await importCuttingNorms();
  }
}
