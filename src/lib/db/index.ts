import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import path from "node:path";
import fs from "node:fs";

const defaultPath = path.join(process.cwd(), "data", "deisida.db");

function resolveDatabasePath(): string {
  const configured = process.env.DATABASE_PATH;
  if (configured) {
    return path.isAbsolute(configured)
      ? configured
      : path.join(process.cwd(), configured);
  }
  return defaultPath;
}

const databasePath = resolveDatabasePath();

fs.mkdirSync(path.dirname(databasePath), { recursive: true });

const sqlite = new Database(databasePath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });

export function initializeDatabase(): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      worker_pin_hash TEXT
    );
    CREATE TABLE IF NOT EXISTS tiles (
      id TEXT PRIMARY KEY,
      bubble_id TEXT UNIQUE,
      name TEXT NOT NULL,
      supplier TEXT NOT NULL DEFAULT '',
      manufacturer TEXT NOT NULL DEFAULT '',
      price_eur REAL NOT NULL DEFAULT 0,
      quantity_per_pallet INTEGER NOT NULL DEFAULT 0,
      length_mm INTEGER NOT NULL DEFAULT 0,
      width_mm INTEGER NOT NULL DEFAULT 0,
      height_mm INTEGER NOT NULL DEFAULT 0,
      default_storis_mm INTEGER NOT NULL DEFAULT 0,
      description TEXT NOT NULL DEFAULT '',
      disc_id TEXT REFERENCES discs(id),
      disc TEXT,
      hardness INTEGER,
      fragility_strip TEXT,
      fragility_corner TEXT
    );
    CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY,
      bubble_id TEXT UNIQUE,
      name TEXT NOT NULL,
      email TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS machines (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      shop_code TEXT,
      title TEXT NOT NULL,
      daily_rate INTEGER NOT NULL DEFAULT 0,
      pieces_per_day INTEGER,
      rotation_hours REAL,
      current_width_mm INTEGER
    );
    CREATE TABLE IF NOT EXISTS discs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      diameter_mm INTEGER,
      thickness_mm INTEGER,
      supplier TEXT NOT NULL DEFAULT '',
      price_eur REAL,
      work_id TEXT
    );
    CREATE TABLE IF NOT EXISTS proposals (
      id TEXT PRIMARY KEY,
      number TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'draft',
      valid_until TEXT NOT NULL,
      service_deadline TEXT NOT NULL,
      client_id TEXT,
      client_name TEXT NOT NULL DEFAULT '',
      object TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL DEFAULT '',
      comment TEXT NOT NULL DEFAULT '',
      pjovimas TEXT NOT NULL DEFAULT '',
      packaging_json TEXT NOT NULL DEFAULT '{}',
      created_by_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS proposal_lines (
      id TEXT PRIMARY KEY,
      proposal_id TEXT NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
      tile_id TEXT NOT NULL REFERENCES tiles(id),
      quantity REAL NOT NULL,
      quantity_unit TEXT NOT NULL,
      storis_mm INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      proposal_id TEXT NOT NULL REFERENCES proposals(id),
      proposal_line_id TEXT NOT NULL REFERENCES proposal_lines(id),
      tile_id TEXT NOT NULL REFERENCES tiles(id),
      status TEXT NOT NULL DEFAULT 'queued',
      quantity REAL NOT NULL,
      quantity_unit TEXT NOT NULL,
      piece_count INTEGER NOT NULL DEFAULT 0,
      completed_pieces INTEGER NOT NULL DEFAULT 0,
      deadline TEXT NOT NULL,
      machine_id TEXT REFERENCES machines(id),
      width_mm INTEGER NOT NULL DEFAULT 0,
      storis_mm INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      started_at TEXT,
      finished_at TEXT
    );
    CREATE TABLE IF NOT EXISTS pallet_logs (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      quantity INTEGER NOT NULL,
      good_quantity INTEGER NOT NULL DEFAULT 0,
      defect_quantity INTEGER NOT NULL DEFAULT 0,
      comment TEXT,
      damaged INTEGER NOT NULL DEFAULT 0,
      logged_at TEXT NOT NULL,
      logged_by_id TEXT REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS machine_downtimes (
      id TEXT PRIMARY KEY,
      machine_id TEXT NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
      start_at TEXT NOT NULL,
      end_at TEXT NOT NULL,
      reason TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      created_by_id TEXT REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY,
      job_id TEXT REFERENCES jobs(id),
      type TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL,
      acknowledged INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS machine_assignments (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      machine_id TEXT NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
      PRIMARY KEY (user_id, machine_id)
    );
    CREATE TABLE IF NOT EXISTS work_norms (
      id TEXT PRIMARY KEY,
      machine_code TEXT NOT NULL,
      label TEXT NOT NULL,
      min_pieces_per_day INTEGER NOT NULL,
      unit TEXT NOT NULL DEFAULT 'pieces',
      source_row TEXT,
      imported_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS rotation_periods (
      id TEXT PRIMARY KEY,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      created_at TEXT NOT NULL,
      created_by_id TEXT REFERENCES users(id),
      note TEXT
    );
    CREATE TABLE IF NOT EXISTS rotation_assignments (
      id TEXT PRIMARY KEY,
      period_id TEXT NOT NULL REFERENCES rotation_periods(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      machine_id TEXT REFERENCES machines(id) ON DELETE SET NULL,
      assigned_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS rotation_history (
      id TEXT PRIMARY KEY,
      period_id TEXT NOT NULL REFERENCES rotation_periods(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id),
      from_machine_id TEXT REFERENCES machines(id),
      to_machine_id TEXT REFERENCES machines(id),
      changed_at TEXT NOT NULL,
      changed_by_id TEXT REFERENCES users(id),
      reason TEXT,
      action TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS cutting_norms (
      id TEXT PRIMARY KEY,
      machine_code TEXT NOT NULL,
      label TEXT NOT NULL,
      brick_key TEXT,
      min_pieces_per_day INTEGER NOT NULL,
      unit TEXT NOT NULL DEFAULT 'pieces',
      source_row TEXT,
      sheet TEXT NOT NULL DEFAULT '',
      imported_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS queue_plan_runs (
      id TEXT PRIMARY KEY,
      generated_at TEXT NOT NULL,
      locked_week_start TEXT NOT NULL,
      locked_week_end TEXT NOT NULL,
      ai_comments_json TEXT NOT NULL DEFAULT '[]',
      ai_source TEXT NOT NULL DEFAULT 'mock',
      status TEXT NOT NULL DEFAULT 'ready'
    );
    CREATE TABLE IF NOT EXISTS queue_plan_items (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES queue_plan_runs(id) ON DELETE CASCADE,
      job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      machine_id TEXT NOT NULL REFERENCES machines(id),
      planned_start TEXT NOT NULL,
      planned_end TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'P3',
      locked_week INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      width_mm INTEGER NOT NULL DEFAULT 0,
      storis_mm INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS queue_overrides (
      id TEXT PRIMARY KEY,
      run_id TEXT REFERENCES queue_plan_runs(id) ON DELETE SET NULL,
      job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      from_machine_id TEXT REFERENCES machines(id),
      to_machine_id TEXT REFERENCES machines(id),
      from_start TEXT,
      to_start TEXT,
      reason TEXT NOT NULL,
      user_id TEXT REFERENCES users(id),
      created_at TEXT NOT NULL
    );
  `);

  const proposalColumns = sqlite
    .prepare("PRAGMA table_info(proposals)")
    .all() as { name: string }[];
  if (!proposalColumns.some((column) => column.name === "address")) {
    sqlite.exec(`ALTER TABLE proposals ADD COLUMN address TEXT NOT NULL DEFAULT ''`);
  }

  const machineColumns = sqlite
    .prepare("PRAGMA table_info(machines)")
    .all() as { name: string }[];
  if (!machineColumns.some((column) => column.name === "shop_code")) {
    sqlite.exec(`ALTER TABLE machines ADD COLUMN shop_code TEXT`);
  }
  if (!machineColumns.some((column) => column.name === "pieces_per_day")) {
    sqlite.exec(`ALTER TABLE machines ADD COLUMN pieces_per_day INTEGER`);
  }

  const jobColumns = sqlite
    .prepare("PRAGMA table_info(jobs)")
    .all() as { name: string }[];
  if (!jobColumns.some((column) => column.name === "storis_mm")) {
    sqlite.exec(`ALTER TABLE jobs ADD COLUMN storis_mm INTEGER NOT NULL DEFAULT 0`);
  }

  const lineColumns = sqlite
    .prepare("PRAGMA table_info(proposal_lines)")
    .all() as { name: string }[];
  if (!lineColumns.some((column) => column.name === "storis_mm")) {
    sqlite.exec(
      `ALTER TABLE proposal_lines ADD COLUMN storis_mm INTEGER NOT NULL DEFAULT 0`,
    );
  }

  const userColumns = sqlite
    .prepare("PRAGMA table_info(users)")
    .all() as { name: string }[];
  if (!userColumns.some((column) => column.name === "worker_pin_hash")) {
    sqlite.exec(`ALTER TABLE users ADD COLUMN worker_pin_hash TEXT`);
  }

  const palletColumns = sqlite
    .prepare("PRAGMA table_info(pallet_logs)")
    .all() as { name: string }[];
  if (!palletColumns.some((column) => column.name === "good_quantity")) {
    sqlite.exec(`ALTER TABLE pallet_logs ADD COLUMN good_quantity INTEGER NOT NULL DEFAULT 0`);
  }
  if (!palletColumns.some((column) => column.name === "defect_quantity")) {
    sqlite.exec(`ALTER TABLE pallet_logs ADD COLUMN defect_quantity INTEGER NOT NULL DEFAULT 0`);
  }
  if (!palletColumns.some((column) => column.name === "comment")) {
    sqlite.exec(`ALTER TABLE pallet_logs ADD COLUMN comment TEXT`);
  }

  const discColumns = sqlite
    .prepare("PRAGMA table_info(discs)")
    .all() as { name: string }[];
  if (!discColumns.some((column) => column.name === "diameter_mm")) {
    sqlite.exec(`ALTER TABLE discs ADD COLUMN diameter_mm INTEGER`);
  }
  if (!discColumns.some((column) => column.name === "thickness_mm")) {
    sqlite.exec(`ALTER TABLE discs ADD COLUMN thickness_mm INTEGER`);
  }
  if (!discColumns.some((column) => column.name === "supplier")) {
    sqlite.exec(`ALTER TABLE discs ADD COLUMN supplier TEXT NOT NULL DEFAULT ''`);
  }
  if (!discColumns.some((column) => column.name === "price_eur")) {
    sqlite.exec(`ALTER TABLE discs ADD COLUMN price_eur REAL`);
  }
  if (!discColumns.some((column) => column.name === "work_id")) {
    sqlite.exec(`ALTER TABLE discs ADD COLUMN work_id TEXT`);
  }

  const tileColumns = sqlite
    .prepare("PRAGMA table_info(tiles)")
    .all() as { name: string }[];
  if (!tileColumns.some((column) => column.name === "disc_id")) {
    sqlite.exec(`ALTER TABLE tiles ADD COLUMN disc_id TEXT REFERENCES discs(id)`);
  }

  sqlite.exec(`
    UPDATE jobs
    SET storis_mm = COALESCE(
      (
        SELECT CASE
          WHEN tiles.default_storis_mm > 0 THEN tiles.default_storis_mm
          ELSE tiles.height_mm
        END
        FROM tiles
        WHERE tiles.id = jobs.tile_id
      ),
      0
    )
    WHERE storis_mm = 0;

    UPDATE proposal_lines
    SET storis_mm = COALESCE(
      (
        SELECT CASE
          WHEN tiles.default_storis_mm > 0 THEN tiles.default_storis_mm
          ELSE tiles.height_mm
        END
        FROM tiles
        WHERE tiles.id = proposal_lines.tile_id
      ),
      0
    )
    WHERE storis_mm = 0;
  `);
}

initializeDatabase();
