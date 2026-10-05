import { eq } from "drizzle-orm";
import { db, initializeDatabase } from "../src/lib/db";
import {
  jobs,
  machines,
  queuePlanItems,
} from "../src/lib/db/schema";

async function main() {
  initializeDatabase();
  const machineRows = await db.select().from(machines);
  for (const machine of machineRows.sort((a, b) => a.code.localeCompare(b.code))) {
    const items = await db
      .select({
        widthMm: jobs.widthMm,
        start: queuePlanItems.plannedStart,
        end: queuePlanItems.plannedEnd,
        locked: queuePlanItems.lockedWeek,
        pieces: jobs.pieceCount,
      })
      .from(queuePlanItems)
      .innerJoin(jobs, eq(jobs.id, queuePlanItems.jobId))
      .where(eq(queuePlanItems.machineId, machine.id))
      .orderBy(queuePlanItems.plannedStart);
    const locked = items.filter((item) => item.locked);
    console.log(
      machine.code,
      `admin=${machine.currentWidthMm}mm`,
      `locked=${locked.length}/${items.length}`,
      `lastLockedEnd=${locked.at(-1)?.end?.slice(0, 16) ?? "-"}`,
    );
  }
}

main();
