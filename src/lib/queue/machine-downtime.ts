import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { machineDowntimes } from "@/lib/db/schema";

export {
  isMachineDown,
  listActiveMachineDowntimes,
  listMachineDowntimesWithCodes,
  listPlanningDowntimes,
  latestDowntimeEndByMachine,
  unavailableMachineIdsFromDowntimes,
} from "./downtime-queries";

export interface MachineDowntimeInput {
  machineId: string;
  startAt: string;
  endAt: string;
  reason: string;
  createdById: string;
}

export async function createMachineDowntime(
  input: MachineDowntimeInput,
): Promise<typeof machineDowntimes.$inferSelect> {
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  await db.insert(machineDowntimes).values({
    id,
    machineId: input.machineId,
    startAt: input.startAt,
    endAt: input.endAt,
    reason: input.reason.trim(),
    createdAt,
    createdById: input.createdById,
  });
  const [row] = await db
    .select()
    .from(machineDowntimes)
    .where(eq(machineDowntimes.id, id))
    .limit(1);
  return row!;
}

export async function deleteMachineDowntime(id: string): Promise<void> {
  await db.delete(machineDowntimes).where(eq(machineDowntimes.id, id));
}
