import { eq, like } from "drizzle-orm";
import { db, initializeDatabase } from "../src/lib/db";
import {
  jobs,
  machines,
  proposals,
  queuePlanItems,
} from "../src/lib/db/schema";

async function main() {
  initializeDatabase();
  const rows = await db
    .select({
      number: proposals.number,
      widthMm: jobs.widthMm,
      lockedWeek: queuePlanItems.lockedWeek,
      code: machines.code,
      start: queuePlanItems.plannedStart,
    })
    .from(queuePlanItems)
    .innerJoin(jobs, eq(jobs.id, queuePlanItems.jobId))
    .innerJoin(proposals, eq(proposals.id, jobs.proposalId))
    .innerJoin(machines, eq(machines.id, queuePlanItems.machineId))
    .where(like(proposals.number, "STRESS-%"))
    .orderBy(queuePlanItems.plannedStart);

  for (const row of rows) {
    console.log(
      row.code,
      row.number,
      row.widthMm + "mm",
      row.lockedWeek ? "LOCKED" : "later",
      row.start?.slice(0, 10),
    );
  }
}

main();
