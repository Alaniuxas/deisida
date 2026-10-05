import { desc, eq } from "drizzle-orm";
import { db } from "../src/lib/db";
import {
  jobs,
  machineDowntimes,
  machines,
  queuePlanItems,
  queuePlanRuns,
} from "../src/lib/db/schema";

async function main() {
  const downtimes = await db
    .select({ d: machineDowntimes, m: machines })
    .from(machineDowntimes)
    .innerJoin(machines, eq(machineDowntimes.machineId, machines.id))
    .orderBy(desc(machineDowntimes.createdAt));

  console.log("=== DOWNTIMES ===");
  for (const row of downtimes) {
    console.log(
      `${row.m.code}: ${row.d.startAt} → ${row.d.endAt} (${row.d.reason || "—"})`,
    );
  }

  const [run] = await db
    .select()
    .from(queuePlanRuns)
    .orderBy(desc(queuePlanRuns.generatedAt))
    .limit(1);
  if (!run) {
    console.log("No plan run.");
    return;
  }

  console.log(
    `\n=== PLAN ${run.id.slice(0, 8)} (${run.status}) ${run.lockedWeekStart}–${run.lockedWeekEnd} ===`,
  );

  const items = await db
    .select({
      item: queuePlanItems,
      job: jobs,
      machine: machines,
    })
    .from(queuePlanItems)
    .innerJoin(jobs, eq(queuePlanItems.jobId, jobs.id))
    .innerJoin(machines, eq(queuePlanItems.machineId, machines.id))
    .where(eq(queuePlanItems.runId, run.id));

  const byMachine = new Map<
    string,
    { total: number; queued: number; in_progress: number }
  >();
  for (const row of items) {
    const code = row.machine.code;
    const bucket = byMachine.get(code) ?? { total: 0, queued: 0, in_progress: 0 };
    bucket.total += 1;
    if (row.job.status === "queued") bucket.queued += 1;
    if (row.job.status === "in_progress") bucket.in_progress += 1;
    byMachine.set(code, bucket);
  }

  console.log("\n=== JOBS PER MACHINE ===");
  for (const [code, counts] of [...byMachine.entries()].sort()) {
    console.log(`${code}: ${counts.total} total (${counts.queued} queued, ${counts.in_progress} in progress)`);
  }

  if (downtimes.length === 0) {
    console.log("\nNo downtime rows — nothing to analyze.");
    return;
  }

  const down = downtimes[0];
  const downStart = new Date(down.d.startAt);
  const downEnd = new Date(down.d.endAt);
  const durationDays =
    (downEnd.getTime() - downStart.getTime()) / (24 * 60 * 60 * 1000);

  const onDownMachine = items.filter((row) => row.item.machineId === down.d.machineId);
  const queuedOnDown = onDownMachine.filter((row) => row.job.status === "queued");
  const inProgressOnDown = onDownMachine.filter(
    (row) => row.job.status === "in_progress",
  );

  const wouldOverlapDowntime = (plannedStart: string, plannedEnd: string) => {
    const start = new Date(plannedStart);
    const end = new Date(plannedEnd);
    return start < downEnd && end > downStart;
  };

  const allQueued = items.filter((row) => row.job.status === "queued");
  const overlapDuringDowntime = allQueued.filter((row) =>
    wouldOverlapDowntime(row.item.plannedStart, row.item.plannedEnd),
  );
  const startAfterDowntime = allQueued.filter(
    (row) => new Date(row.item.plannedStart) >= downEnd,
  );

  console.log(`\n=== ${down.m.code} DOWNTIME (~${durationDays.toFixed(1)} d) ===`);
  console.log(`Still on ${down.m.code}: ${onDownMachine.length} (${queuedOnDown.length} queued, ${inProgressOnDown.length} in_progress)`);
  console.log(`All queued jobs overlapping downtime window: ${overlapDuringDowntime.length}`);
  console.log(`Queued jobs starting AFTER downtime ends: ${startAfterDowntime.length}`);
  console.log(
    `Current logic moves ALL queued off down machine (${allQueued.length} queued total in plan)`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
