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
      password_hash TEXT NOT NULL
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
      title TEXT NOT NULL,
      daily_rate INTEGER NOT NULL DEFAULT 0,
      rotation_hours REAL,
      current_width_mm INTEGER
    );
    CREATE TABLE IF NOT EXISTS discs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT
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
      sort_order INTEGER NOT NULL DEFAULT 0,
      started_at TEXT,
      finished_at TEXT
    );
    CREATE TABLE IF NOT EXISTS pallet_logs (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      quantity INTEGER NOT NULL,
      damaged INTEGER NOT NULL DEFAULT 0,
      logged_at TEXT NOT NULL,
      logged_by_id TEXT REFERENCES users(id)
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
  `);
}

initializeDatabase();
