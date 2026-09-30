import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, initializeDatabase } from "../src/lib/db";
import {
  users,
  tiles,
  clients,
  machines,
  discs,
} from "../src/lib/db/schema";

const ARCHIVE_PATH =
  process.env.ARCHIVE_PATH ??
  "/home/ubuntu/.cursor/projects/workspace/uploads/Archive_e4df.zip";
const EXTRACT_DIR = path.join(process.cwd(), "data", "archive-import");
const STARTER_PASSWORD = "deisida";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function readCsv(filename: string): Record<string, string>[] {
  const filePath = path.join(EXTRACT_DIR, filename);
  if (!fs.existsSync(filePath)) {
    console.warn(`Skipping missing file: ${filename}`);
    return [];
  }
  const content = fs.readFileSync(filePath, "utf8");
  return parse(content, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  }) as Record<string, string>[];
}

function toInt(value: string | undefined, fallback = 0): number {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toFloat(value: string | undefined, fallback = 0): number {
  const parsed = Number.parseFloat(String(value ?? "").trim());
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toPercent(value: string | undefined): string | null {
  if (!value) return null;
  const num = Number.parseFloat(value);
  if (!Number.isFinite(num)) return null;
  return `${(num * 100).toFixed(1)}%`;
}

async function clearTables(): Promise<void> {
  await db.delete(discs);
  await db.delete(clients);
  await db.delete(tiles);
  await db.delete(users);
  await db.delete(machines);
}

async function importUsers(passwordHash: string): Promise<number> {
  const rows = readCsv("export_All-Users-modified_2026-09-28_08-37-12.csv");
  let count = 0;

  for (const row of rows) {
    const email = (row.email ?? "").trim().toLowerCase();
    if (!email) continue;

    let role: "admin" | "pardavimai" | "cechas";
    if (email === "pardavimai@deisida.lt") {
      role = "pardavimai";
    } else if (row.type === "Administratorius") {
      role = "admin";
    } else {
      role = "cechas";
    }

    await db
      .insert(users)
      .values({
        id: row["unique id"] || `user-${slugify(email)}`,
        email,
        name: row.name?.trim() || email,
        role,
        passwordHash,
      })
      .onConflictDoUpdate({
        target: users.email,
        set: {
          name: row.name?.trim() || email,
          role,
          passwordHash,
        },
      });
    count += 1;
  }

  return count;
}

async function importTiles(): Promise<number> {
  const rows = readCsv("export_All-Bricks-modified_2026-09-28_08-25-38.csv");
  let count = 0;

  for (const row of rows) {
    const title = row.title?.trim();
    if (!title) continue;

    const height = toInt(row.height);
    const id = slugify(title) || row["unique id"];

    await db
      .insert(tiles)
      .values({
        id,
        bubbleId: row["unique id"] || null,
        name: title,
        supplier: row.supplier?.trim() || "",
        manufacturer: row.manufacturer?.trim() || "",
        priceEur: toFloat(row.price),
        quantityPerPallet: toInt(row.quantity_in_pallet),
        lengthMm: toInt(row.length),
        widthMm: toInt(row.width),
        heightMm: height,
        defaultStorisMm: height,
        description: row.description?.trim() || "",
        disc: row.disc?.trim() || null,
        hardness: row.hardness ? toInt(row.hardness) : null,
        fragilityStrip: toPercent(row.fragility_stripe),
        fragilityCorner: toPercent(row.fragility_corner),
      })
      .onConflictDoUpdate({
        target: tiles.id,
        set: {
          name: title,
          supplier: row.supplier?.trim() || "",
          manufacturer: row.manufacturer?.trim() || "",
          priceEur: toFloat(row.price),
          quantityPerPallet: toInt(row.quantity_in_pallet),
          lengthMm: toInt(row.length),
          widthMm: toInt(row.width),
          heightMm: height,
          defaultStorisMm: height,
          description: row.description?.trim() || "",
          disc: row.disc?.trim() || null,
          hardness: row.hardness ? toInt(row.hardness) : null,
          fragilityStrip: toPercent(row.fragility_stripe),
          fragilityCorner: toPercent(row.fragility_corner),
        },
      });
    count += 1;
  }

  return count;
}

async function importClients(): Promise<number> {
  const rows = readCsv("export_All-Clients-modified_2026-09-28_08-26-40.csv");
  let count = 0;

  for (const row of rows) {
    const name = row.name?.trim();
    if (!name) continue;

    const id = row["unique id"] || `client-${slugify(name)}`;

    await db
      .insert(clients)
      .values({
        id,
        bubbleId: row["unique id"] || null,
        name,
        email: row.email?.trim() || "",
        phone: row.phone?.trim() || "",
        address: row.address?.trim() || "",
        type: row.type?.trim() || "",
      })
      .onConflictDoUpdate({
        target: clients.id,
        set: {
          name,
          email: row.email?.trim() || "",
          phone: row.phone?.trim() || "",
          address: row.address?.trim() || "",
          type: row.type?.trim() || "",
        },
      });
    count += 1;
  }

  return count;
}

async function importMachines(): Promise<number> {
  const rows = readCsv("export_All-Machines-modified--_2026-09-28_08-28-42.csv");
  const targets = new Map<string, { dailyRate: number; title: string }>([
    ["KONV", { dailyRate: 240, title: "Senas konvejeris" }],
    ["KNEW", { dailyRate: 720, title: "Naujas konvejeris" }],
  ]);

  const importedCodes = new Set<string>();
  let count = 0;
  for (const row of rows) {
    const code = row.identifier?.trim();
    if (!code || !targets.has(code) || importedCodes.has(code)) continue;

    const config = targets.get(code)!;
    importedCodes.add(code);

    await db
      .insert(machines)
      .values({
        id: code,
        code,
        title: row.title?.trim() || config.title,
        dailyRate: config.dailyRate,
        rotationHours: null,
        currentWidthMm: null,
      })
      .onConflictDoUpdate({
        target: machines.id,
        set: {
          title: row.title?.trim() || config.title,
          dailyRate: config.dailyRate,
        },
      });
    count += 1;
  }

  return count;
}

async function main(): Promise<void> {
  initializeDatabase();

  if (!fs.existsSync(EXTRACT_DIR)) {
    fs.mkdirSync(EXTRACT_DIR, { recursive: true });
    if (ARCHIVE_PATH.endsWith(".zip") && fs.existsSync(ARCHIVE_PATH)) {
      const { execSync } = await import("node:child_process");
      execSync(`unzip -q -o "${ARCHIVE_PATH}" -d "${EXTRACT_DIR}"`);
    }
  }

  const passwordHash = await bcrypt.hash(STARTER_PASSWORD, 10);
  await clearTables();

  const importedUsers = await importUsers(passwordHash);
  const importedTiles = await importTiles();
  const importedClients = await importClients();
  const importedMachines = await importMachines();

  console.log(
    JSON.stringify(
      {
        users: importedUsers,
        tiles: importedTiles,
        clients: importedClients,
        machines: importedMachines,
        discs: 0,
        password: STARTER_PASSWORD,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
