import { db, initializeDatabase } from "../src/lib/db";
import { jobs, queuePlanItems, queuePlanRuns } from "../src/lib/db/schema";
import { desc, eq, inArray } from "drizzle-orm";

async function main() {
  initializeDatabase();
  const open = await db
    .select()
    .from(jobs)
    .where(inArray(jobs.status, ["queued", "in_progress"]));
  const [run] = await db
    .select()
    .from(queuePlanRuns)
    .orderBy(desc(queuePlanRuns.generatedAt))
    .limit(1);
  if (!run) return;

  const items = await db
    .select()
    .from(queuePlanItems)
    .where(eq(queuePlanItems.runId, run.id));

  let violations = 0;
  for (const item of items) {
    const job = open.find((row) => row.id === item.jobId);
    if (!job) continue;
    const startDay = item.plannedStart.slice(0, 10);
    if (job.deadline < startDay) {
      violations += 1;
      if (violations <= 5) {
        console.log(
          "LATE deadline",
          job.deadline,
          "< start",
          startDay,
          "w" + job.widthMm,
          item.plannedStart.slice(0, 16),
        );
      }
    }
  }
  console.log("deadline before planned start:", violations, "/", items.length);
}

main();
