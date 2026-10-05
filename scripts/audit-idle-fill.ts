import { desc, eq, inArray } from "drizzle-orm";
import { initializeDatabase } from "../src/lib/db";
import { db } from "../src/lib/db";
import { jobs, machines, queuePlanItems, queuePlanRuns } from "../src/lib/db/schema";
import { isJobStartInLockedPlanWeek } from "../src/lib/queue/week";
import { getScheduledQueue } from "../src/lib/queue/service";

async function main() {
  initializeDatabase();
  const [run] = await db
    .select()
    .from(queuePlanRuns)
    .orderBy(desc(queuePlanRuns.generatedAt))
    .limit(1);
  if (!run) {
    console.log("NO PLAN");
    return;
  }
  const machineRows = await db.select().from(machines);
  const items = await db
    .select()
    .from(queuePlanItems)
    .where(eq(queuePlanItems.runId, run.id));
  const jobRows = await db
    .select()
    .from(jobs)
    .where(inArray(jobs.status, ["queued", "in_progress"]));
  const jobById = new Map(jobRows.map((job) => [job.id, job]));
  const week = { startIso: run.lockedWeekStart, endIso: run.lockedWeekEnd };
  const codeById = new Map(machineRows.map((machine) => [machine.id, machine.code]));

  console.log(
    JSON.stringify(
      { week, status: run.status, items: items.length, openJobs: jobRows.length },
      null,
      2,
    ),
  );

  for (const machine of machineRows) {
    const list = items
      .filter((item) => item.machineId === machine.id)
      .sort((left, right) => left.plannedStart.localeCompare(right.plannedStart));
    const inWeek = list.filter((item) =>
      isJobStartInLockedPlanWeek(item.plannedStart, week),
    );
    const later = list.filter(
      (item) => !isJobStartInLockedPlanWeek(item.plannedStart, week),
    );
    const last = inWeek[inWeek.length - 1];
    console.log(
      machine.code,
      `admin=${machine.currentWidthMm}`,
      `inWeek=${inWeek.length}`,
      `later=${later.length}`,
      `lastEnd=${last?.plannedEnd?.slice(0, 16) ?? "-"}`,
      `inW=${[...new Set(inWeek.map((item) => item.widthMm))].sort((a, b) => a - b).join(",")}`,
      `laterW=${[...new Set(later.map((item) => item.widthMm))].sort((a, b) => a - b).join(",")}`,
    );
  }

  const unplanned = jobRows.filter(
    (job) => !items.find((item) => item.jobId === job.id),
  );
  console.log(
    "unplanned",
    unplanned.length,
    [...new Set(unplanned.map((job) => job.widthMm))]
      .sort((a, b) => a - b)
      .join(","),
  );

  const laterItems = items.filter(
    (item) => !isJobStartInLockedPlanWeek(item.plannedStart, week),
  );
  const laterWidths = new Map<number, number>();
  for (const item of laterItems) {
    const width = item.widthMm || jobById.get(item.jobId)?.widthMm || 0;
    laterWidths.set(width, (laterWidths.get(width) || 0) + 1);
  }
  console.log("later width histogram:");
  for (const [width, count] of [...laterWidths.entries()].sort(
    (left, right) => left[0] - right[0],
  )) {
    const machinesForWidth = [
      ...new Set(
        laterItems
          .filter(
            (item) =>
              (item.widthMm || jobById.get(item.jobId)?.widthMm) === width,
          )
          .map((item) => codeById.get(item.machineId)),
      ),
    ];
    console.log(`  ${width}mm x${count} machines=${machinesForWidth.join(",")}`);
  }

  const queue = await getScheduledQueue();
  console.log("UI laterLockedCount", queue.laterLockedCount);
  for (const lane of queue.lanes) {
    const last = lane.jobs[lane.jobs.length - 1];
    console.log(
      "UI",
      lane.code,
      "visible",
      lane.jobs.length,
      "later",
      lane.laterJobCount,
      "lastEnd",
      last?.schedule?.estimatedEnd?.slice(0, 16),
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
