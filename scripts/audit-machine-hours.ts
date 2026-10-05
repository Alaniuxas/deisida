import { db, initializeDatabase } from "../src/lib/db";
import { jobs, machines, queuePlanItems, queuePlanRuns } from "../src/lib/db/schema";
import { desc, eq, inArray } from "drizzle-orm";
import { durationHoursFromPlan, WORK_HOURS_PER_DAY } from "../src/lib/queue/work-hours";

async function main() {
  initializeDatabase();
  const machineRows = await db.select().from(machines);
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

  console.log("Week:", run.lockedWeekStart, "→", run.lockedWeekEnd);
  console.log("Work hours/day:", WORK_HOURS_PER_DAY);

  for (const m of machineRows.sort((a, b) => a.code.localeCompare(b.code))) {
    const lane = items
      .filter((i) => i.machineId === m.id && i.lockedWeek)
      .sort((a, b) => a.plannedStart.localeCompare(b.plannedStart));
    let hours = 0;
    for (const i of lane) {
      hours += durationHoursFromPlan(i.plannedStart, i.plannedEnd);
    }
    const last = lane[lane.length - 1];
    console.log(
      m.code.padEnd(4),
      `jobs=${lane.length}`.padEnd(10),
      `hours=${hours.toFixed(1)}/${WORK_HOURS_PER_DAY * 5}`.padEnd(18),
      last ? `ends ${last.plannedEnd.slice(0, 16)}` : "idle",
    );
  }
}

main();
