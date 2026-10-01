import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  role: text("role", { enum: ["admin", "pardavimai", "cechas"] }).notNull(),
  passwordHash: text("password_hash").notNull(),
});

export const tiles = sqliteTable("tiles", {
  id: text("id").primaryKey(),
  bubbleId: text("bubble_id").unique(),
  name: text("name").notNull(),
  supplier: text("supplier").notNull().default(""),
  manufacturer: text("manufacturer").notNull().default(""),
  priceEur: real("price_eur").notNull().default(0),
  quantityPerPallet: integer("quantity_per_pallet").notNull().default(0),
  lengthMm: integer("length_mm").notNull().default(0),
  widthMm: integer("width_mm").notNull().default(0),
  heightMm: integer("height_mm").notNull().default(0),
  defaultStorisMm: integer("default_storis_mm").notNull().default(0),
  description: text("description").notNull().default(""),
  disc: text("disc"),
  hardness: integer("hardness"),
  fragilityStrip: text("fragility_strip"),
  fragilityCorner: text("fragility_corner"),
});

export const clients = sqliteTable("clients", {
  id: text("id").primaryKey(),
  bubbleId: text("bubble_id").unique(),
  name: text("name").notNull(),
  email: text("email").notNull().default(""),
  phone: text("phone").notNull().default(""),
  address: text("address").notNull().default(""),
  type: text("type").notNull().default(""),
});

export const machines = sqliteTable("machines", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  title: text("title").notNull(),
  dailyRate: integer("daily_rate").notNull().default(0),
  rotationHours: real("rotation_hours"),
  currentWidthMm: integer("current_width_mm"),
});

export const discs = sqliteTable("discs", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
});

export const proposals = sqliteTable("proposals", {
  id: text("id").primaryKey(),
  number: text("number").notNull().unique(),
  status: text("status", {
    enum: ["draft", "sent", "confirmed", "in_production"],
  })
    .notNull()
    .default("draft"),
  validUntil: text("valid_until").notNull(),
  serviceDeadline: text("service_deadline").notNull(),
  clientId: text("client_id"),
  clientName: text("client_name").notNull().default(""),
  object: text("object").notNull().default(""),
  address: text("address").notNull().default(""),
  comment: text("comment").notNull().default(""),
  pjovimas: text("pjovimas").notNull().default(""),
  packagingJson: text("packaging_json").notNull().default("{}"),
  createdById: text("created_by_id"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const proposalLines = sqliteTable("proposal_lines", {
  id: text("id").primaryKey(),
  proposalId: text("proposal_id")
    .notNull()
    .references(() => proposals.id, { onDelete: "cascade" }),
  tileId: text("tile_id")
    .notNull()
    .references(() => tiles.id),
  quantity: real("quantity").notNull(),
  quantityUnit: text("quantity_unit", { enum: ["pieces", "pallets"] }).notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const jobs = sqliteTable("jobs", {
  id: text("id").primaryKey(),
  proposalId: text("proposal_id")
    .notNull()
    .references(() => proposals.id),
  proposalLineId: text("proposal_line_id")
    .notNull()
    .references(() => proposalLines.id),
  tileId: text("tile_id")
    .notNull()
    .references(() => tiles.id),
  status: text("status", { enum: ["queued", "in_progress", "completed"] })
    .notNull()
    .default("queued"),
  quantity: real("quantity").notNull(),
  quantityUnit: text("quantity_unit", { enum: ["pieces", "pallets"] }).notNull(),
  pieceCount: integer("piece_count").notNull().default(0),
  completedPieces: integer("completed_pieces").notNull().default(0),
  deadline: text("deadline").notNull(),
  machineId: text("machine_id").references(() => machines.id),
  widthMm: integer("width_mm").notNull().default(0),
  sortOrder: integer("sort_order").notNull().default(0),
  startedAt: text("started_at"),
  finishedAt: text("finished_at"),
});

export const palletLogs = sqliteTable("pallet_logs", {
  id: text("id").primaryKey(),
  jobId: text("job_id")
    .notNull()
    .references(() => jobs.id, { onDelete: "cascade" }),
  quantity: integer("quantity").notNull(),
  damaged: integer("damaged", { mode: "boolean" }).notNull().default(false),
  loggedAt: text("logged_at").notNull(),
  loggedById: text("logged_by_id").references(() => users.id),
});

export const alerts = sqliteTable("alerts", {
  id: text("id").primaryKey(),
  jobId: text("job_id").references(() => jobs.id),
  type: text("type").notNull(),
  message: text("message").notNull(),
  createdAt: text("created_at").notNull(),
  acknowledged: integer("acknowledged", { mode: "boolean" })
    .notNull()
    .default(false),
});

export const machineAssignments = sqliteTable("machine_assignments", {
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  machineId: text("machine_id")
    .notNull()
    .references(() => machines.id, { onDelete: "cascade" }),
});

export const workNorms = sqliteTable("work_norms", {
  id: text("id").primaryKey(),
  machineCode: text("machine_code", { enum: ["KONV", "KNEW"] }).notNull(),
  label: text("label").notNull(),
  minPiecesPerDay: integer("min_pieces_per_day").notNull(),
  unit: text("unit").notNull().default("pieces"),
  sourceRow: text("source_row"),
  importedAt: text("imported_at").notNull(),
});

export const rotationPeriods = sqliteTable("rotation_periods", {
  id: text("id").primaryKey(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  createdAt: text("created_at").notNull(),
  createdById: text("created_by_id").references(() => users.id),
  note: text("note"),
});

export const rotationAssignments = sqliteTable("rotation_assignments", {
  id: text("id").primaryKey(),
  periodId: text("period_id")
    .notNull()
    .references(() => rotationPeriods.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  machineId: text("machine_id").references(() => machines.id, {
    onDelete: "set null",
  }),
  assignedAt: text("assigned_at").notNull(),
});

export const rotationHistory = sqliteTable("rotation_history", {
  id: text("id").primaryKey(),
  periodId: text("period_id")
    .notNull()
    .references(() => rotationPeriods.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  fromMachineId: text("from_machine_id").references(() => machines.id),
  toMachineId: text("to_machine_id").references(() => machines.id),
  changedAt: text("changed_at").notNull(),
  changedById: text("changed_by_id").references(() => users.id),
  reason: text("reason"),
  action: text("action", {
    enum: ["plan", "reassign", "release"],
  }).notNull(),
});

export type User = typeof users.$inferSelect;
export type TileRow = typeof tiles.$inferSelect;
export type ClientRow = typeof clients.$inferSelect;
export type MachineRow = typeof machines.$inferSelect;
export type ProposalRow = typeof proposals.$inferSelect;
export type ProposalLineRow = typeof proposalLines.$inferSelect;
export type JobRow = typeof jobs.$inferSelect;
export type WorkNormRow = typeof workNorms.$inferSelect;
export type RotationPeriodRow = typeof rotationPeriods.$inferSelect;
export type RotationAssignmentRow = typeof rotationAssignments.$inferSelect;
export type RotationHistoryRow = typeof rotationHistory.$inferSelect;
