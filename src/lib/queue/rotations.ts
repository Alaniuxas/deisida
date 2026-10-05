import { asc, desc, eq, and, gte, inArray, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  machines,
  rotationAssignments,
  rotationHistory,
  rotationPeriods,
  users,
} from "@/lib/db/schema";
import {
  formatDateIso,
  isDateInPeriod,
  nextFridayFrom,
  parseDateIso,
  todayIso,
} from "@/lib/queue/rotation-dates";
import { getWorkNorms } from "@/lib/queue/work-norms";
import type { MachineCode } from "@/lib/production-types";

export interface RotationPeriodSummary {
  id: string;
  startDate: string;
  endDate: string;
  createdAt: string;
  note: string | null;
  isActive: boolean;
}

export interface RotationHistoryEntry {
  id: string;
  changedAt: string;
  personName: string;
  fromCode: MachineCode | null;
  toCode: MachineCode | null;
  reason: string | null;
  action: "plan" | "reassign" | "release";
  changedByName: string | null;
  periodStartDate: string;
  periodEndDate: string;
}

export interface RotationsAdminData {
  periods: RotationPeriodSummary[];
  activePeriod: RotationPeriodSummary | null;
  activeAssignments: Record<string, string[]>;
  history: RotationHistoryEntry[];
  workNorms: Awaited<ReturnType<typeof getWorkNorms>>;
}

function summarizePeriod(
  period: typeof rotationPeriods.$inferSelect,
  today: string,
): RotationPeriodSummary {
  return {
    id: period.id,
    startDate: period.startDate,
    endDate: period.endDate,
    createdAt: period.createdAt,
    note: period.note,
    isActive: isDateInPeriod(today, period.startDate, period.endDate),
  };
}

export async function getRotationsAdminData(): Promise<RotationsAdminData> {
  const today = todayIso();
  const [periodRows, historyRows, workNormRows] = await Promise.all([
    db.select().from(rotationPeriods).orderBy(desc(rotationPeriods.startDate)),
    db
      .select({
        history: rotationHistory,
        personName: users.name,
        period: rotationPeriods,
      })
      .from(rotationHistory)
      .innerJoin(users, eq(rotationHistory.userId, users.id))
      .innerJoin(
        rotationPeriods,
        eq(rotationHistory.periodId, rotationPeriods.id),
      )
      .orderBy(desc(rotationHistory.changedAt))
      .limit(100),
    getWorkNorms(),
  ]);

  const periods = periodRows.map((period) => summarizePeriod(period, today));
  const activePeriod = periods.find((period) => period.isActive) ?? null;

  let activeAssignments: Record<string, string[]> = {};
  if (activePeriod) {
    const rows = await db
      .select()
      .from(rotationAssignments)
      .where(eq(rotationAssignments.periodId, activePeriod.id));

    activeAssignments = {};
    for (const row of rows) {
      if (!row.machineId) continue;
      const current = activeAssignments[row.machineId] ?? [];
      current.push(row.userId);
      activeAssignments[row.machineId] = current;
    }
  }

  const machineRows = await db.select().from(machines);
  const machineCodeById = new Map(
    machineRows.map((machine) => [machine.id, machine.code as MachineCode]),
  );

  const changedByIds = [
    ...new Set(
      historyRows
        .map((row) => row.history.changedById)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const changedByRows =
    changedByIds.length > 0
      ? await db
          .select({ id: users.id, name: users.name })
          .from(users)
          .where(inArray(users.id, changedByIds))
      : [];
  const changedByNameById = new Map(
    changedByRows.map((row) => [row.id, row.name]),
  );

  const history: RotationHistoryEntry[] = historyRows.map((row) => ({
    id: row.history.id,
    changedAt: row.history.changedAt,
    personName: row.personName,
    fromCode: row.history.fromMachineId
      ? machineCodeById.get(row.history.fromMachineId) ?? null
      : null,
    toCode: row.history.toMachineId
      ? machineCodeById.get(row.history.toMachineId) ?? null
      : null,
    reason: row.history.reason,
    action: row.history.action,
    changedByName: row.history.changedById
      ? changedByNameById.get(row.history.changedById) ?? null
      : null,
    periodStartDate: row.period.startDate,
    periodEndDate: row.period.endDate,
  }));

  return {
    periods,
    activePeriod,
    activeAssignments,
    history,
    workNorms: workNormRows,
  };
}

export async function getActivePeriodForDate(
  dateIso = todayIso(),
): Promise<(typeof rotationPeriods.$inferSelect) | null> {
  const rows = await db
    .select()
    .from(rotationPeriods)
    .where(
      and(
        lte(rotationPeriods.startDate, dateIso),
        gte(rotationPeriods.endDate, dateIso),
      ),
    )
    .orderBy(desc(rotationPeriods.startDate))
    .limit(1);

  return rows[0] ?? null;
}

export async function getActiveRotationMachineId(
  userId: string,
  dateIso = todayIso(),
): Promise<string | null> {
  const period = await getActivePeriodForDate(dateIso);
  if (!period) return null;

  const [assignment] = await db
    .select()
    .from(rotationAssignments)
    .where(
      and(
        eq(rotationAssignments.periodId, period.id),
        eq(rotationAssignments.userId, userId),
      ),
    )
    .limit(1);

  return assignment?.machineId ?? null;
}

export interface CreateRotationPeriodInput {
  startDate: string;
  endDate?: string;
  note?: string;
  assignments: { personId: string; machineId: string | null }[];
  createdById: string;
}

export async function createRotationPeriod(
  input: CreateRotationPeriodInput,
): Promise<RotationsAdminData> {
  const start = parseDateIso(input.startDate);
  const endDate =
    input.endDate ?? formatDateIso(nextFridayFrom(start));
  const now = new Date().toISOString();
  const periodId = crypto.randomUUID();

  await db.insert(rotationPeriods).values({
    id: periodId,
    startDate: input.startDate,
    endDate,
    createdAt: now,
    createdById: input.createdById,
    note: input.note?.trim() || null,
  });

  for (const assignment of input.assignments) {
    const assignmentId = crypto.randomUUID();
    await db.insert(rotationAssignments).values({
      id: assignmentId,
      periodId,
      userId: assignment.personId,
      machineId: assignment.machineId,
      assignedAt: now,
    });

    await db.insert(rotationHistory).values({
      id: crypto.randomUUID(),
      periodId,
      userId: assignment.personId,
      fromMachineId: null,
      toMachineId: assignment.machineId,
      changedAt: now,
      changedById: input.createdById,
      reason: null,
      action: assignment.machineId ? "plan" : "release",
    });
  }

  return getRotationsAdminData();
}

export interface ReassignRotationInput {
  periodId: string;
  personId: string;
  machineId: string | null;
  reason: string;
  changedById: string;
}

export async function reassignRotation(
  input: ReassignRotationInput,
): Promise<RotationsAdminData> {
  const reason = input.reason.trim();
  if (!reason) {
    throw new Error("REASON_REQUIRED");
  }

  const [period] = await db
    .select()
    .from(rotationPeriods)
    .where(eq(rotationPeriods.id, input.periodId))
    .limit(1);

  if (!period) throw new Error("Periodas nerastas.");

  const today = todayIso();
  if (!isDateInPeriod(today, period.startDate, period.endDate)) {
    throw new Error("Galima keisti tik aktyvaus periodo priskyrimus.");
  }

  const [existing] = await db
    .select()
    .from(rotationAssignments)
    .where(
      and(
        eq(rotationAssignments.periodId, input.periodId),
        eq(rotationAssignments.userId, input.personId),
      ),
    )
    .limit(1);

  const now = new Date().toISOString();
  const fromMachineId = existing?.machineId ?? null;

  if (existing) {
    await db
      .update(rotationAssignments)
      .set({ machineId: input.machineId, assignedAt: now })
      .where(eq(rotationAssignments.id, existing.id));
  } else {
    await db.insert(rotationAssignments).values({
      id: crypto.randomUUID(),
      periodId: input.periodId,
      userId: input.personId,
      machineId: input.machineId,
      assignedAt: now,
    });
  }

  await db.insert(rotationHistory).values({
    id: crypto.randomUUID(),
    periodId: input.periodId,
    userId: input.personId,
    fromMachineId,
    toMachineId: input.machineId,
    changedAt: now,
    changedById: input.changedById,
    reason,
    action: input.machineId ? "reassign" : "release",
  });

  return getRotationsAdminData();
}

export function defaultPeriodEnd(startDateIso: string): string {
  return formatDateIso(nextFridayFrom(parseDateIso(startDateIso)));
}

export interface UpdateRotationPeriodInput {
  periodId: string;
  startDate?: string;
  endDate?: string;
  note?: string | null;
  changedById: string;
}

export async function updateRotationPeriod(
  input: UpdateRotationPeriodInput,
): Promise<RotationsAdminData> {
  const [period] = await db
    .select()
    .from(rotationPeriods)
    .where(eq(rotationPeriods.id, input.periodId))
    .limit(1);

  if (!period) throw new Error("Periodas nerastas.");

  const startDate = input.startDate?.trim() || period.startDate;
  const endDate = input.endDate?.trim() || period.endDate;
  if (startDate > endDate) {
    throw new Error("Periodo pabaiga negali būti anksčiau nei pradžia.");
  }

  const note =
    input.note === undefined
      ? period.note
      : input.note?.trim()
        ? input.note.trim()
        : null;

  await db
    .update(rotationPeriods)
    .set({ startDate, endDate, note })
    .where(eq(rotationPeriods.id, input.periodId));

  return getRotationsAdminData();
}

export async function listCechasPeople() {
  return db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(eq(users.role, "cechas"))
    .orderBy(asc(users.name));
}
