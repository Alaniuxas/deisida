import { eq } from "drizzle-orm";
import { db, initializeDatabase } from "../src/lib/db";
import { machines, queuePlanItems, jobs } from "../src/lib/db/schema";
import { vilniusDateIso } from "../src/lib/queue/week";

async function main() {
  initializeDatabase();
  const machineRows = await db.select().from(machines);
  for (const machine of machineRows.sort((a, b) => a.code.localeCompare(b.code))) {
    const items = await db
      .select({
        start: queuePlanItems.plannedStart,
        end: queuePlanItems.plannedEnd,
        locked: queuePlanItems.lockedWeek,
        pieces: jobs.pieceCount,
      })
      .from(queuePlanItems)
      .innerJoin(jobs, eq(jobs.id, queuePlanItems.jobId))
      .where(eq(queuePlanItems.machineId, machine.id))
      .orderBy(queuePlanItems.plannedStart);
    const locked = items.filter((i) => i.locked);
    const days = new Set(
      locked.map((i) => vilniusDateIso(new Date(i.start))),
    );
    console.log(
      machine.code,
      `jobs=${locked.length}`,
      `days=${[...days].sort().join(",")}`,
      `end=${locked.at(-1)?.end?.slice(0, 16)}`,
      `pieces=${locked.reduce((s, i) => s + i.pieces, 0)}`,
    );
  }
}

main();
