import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { machineDowntimes, machines } from "@/lib/db/schema";

export async function listActiveMachineDowntimes(now = new Date()): Promise<
  (typeof machineDowntimes.$inferSelect)[]
> {
  const iso = now.toISOString();
  return db
    .select()
    .from(machineDowntimes)
    .where(and(lte(machineDowntimes.startAt, iso), gte(machineDowntimes.endAt, iso)));
}

/** Downtimes that still block planning (end in the future). */
export async function listPlanningDowntimes(now = new Date()): Promise<
  (typeof machineDowntimes.$inferSelect)[]
> {
  const iso = now.toISOString();
  return db
    .select()
    .from(machineDowntimes)
    .where(gte(machineDowntimes.endAt, iso));
}

export async function isMachineDown(
  machineId: string,
  at = new Date(),
): Promise<boolean> {
  const iso = at.toISOString();
  const [row] = await db
    .select()
    .from(machineDowntimes)
    .where(
      and(
        eq(machineDowntimes.machineId, machineId),
        lte(machineDowntimes.startAt, iso),
        gte(machineDowntimes.endAt, iso),
      ),
    )
    .limit(1);
  return Boolean(row);
}

export function unavailableMachineIdsFromDowntimes(
  downtimes: (typeof machineDowntimes.$inferSelect)[],
): Set<string> {
  return new Set(downtimes.map((row) => row.machineId));
}

export function latestDowntimeEndByMachine(
  downtimes: (typeof machineDowntimes.$inferSelect)[],
): Map<string, Date> {
  const map = new Map<string, Date>();
  for (const row of downtimes) {
    const end = new Date(row.endAt);
    const existing = map.get(row.machineId);
    if (!existing || end.getTime() > existing.getTime()) {
      map.set(row.machineId, end);
    }
  }
  return map;
}

export async function listMachineDowntimesWithCodes(): Promise<
  Array<{
    downtime: typeof machineDowntimes.$inferSelect;
    machineCode: string;
  }>
> {
  const rows = await db
    .select({ downtime: machineDowntimes, machine: machines })
    .from(machineDowntimes)
    .innerJoin(machines, eq(machineDowntimes.machineId, machines.id))
    .orderBy(machineDowntimes.startAt);
  return rows.map((row) => ({
    downtime: row.downtime,
    machineCode: row.machine.code,
  }));
}
