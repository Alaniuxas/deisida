import { desc, eq } from "drizzle-orm";
import { db } from "../src/lib/db";
import {
  jobs,
  machines,
  proposals,
  queuePlanItems,
  queuePlanRuns,
} from "../src/lib/db/schema";
import { getScheduledQueue } from "../src/lib/queue/service";
import { isJobStartInLockedPlanWeek } from "../src/lib/queue/week";

async function main() {
  const [run] = await db
    .select()
    .from(queuePlanRuns)
    .orderBy(desc(queuePlanRuns.generatedAt))
    .limit(1);
  if (!run) {
    console.log("no plan");
    return;
  }
  const week = { startIso: run.lockedWeekStart, endIso: run.lockedWeekEnd };
  console.log("Locked week:", week.startIso, "-", week.endIso);

  const s4 = await db
    .select()
    .from(machines)
    .where(eq(machines.code, "S4"))
    .limit(1);
  const s4Id = s4[0]?.id;
  if (!s4Id) return;

  const items = await db
    .select({ item: queuePlanItems, num: proposals.number })
    .from(queuePlanItems)
    .innerJoin(jobs, eq(jobs.id, queuePlanItems.jobId))
    .innerJoin(proposals, eq(proposals.id, jobs.proposalId))
    .where(eq(queuePlanItems.runId, run.id));

  const s4items = items
    .filter((r) => r.item.machineId === s4Id)
    .sort((a, b) => a.item.plannedStart.localeCompare(b.item.plannedStart));

  console.log("\n=== S4 plan (last 5) ===");
  for (const r of s4items.slice(-5)) {
    const startInWeek = isJobStartInLockedPlanWeek(r.item.plannedStart, week);
    console.log(
      r.num,
      "start",
      r.item.plannedStart.slice(0, 19),
      "lockedFlag",
      r.item.lockedWeek,
      "startInWeek",
      startInWeek,
    );
  }

  const queue = await getScheduledQueue();
  const lane = queue.lanes.find((l) => l.code === "S4");
  console.log("\n=== S4 UI visible jobs:", lane?.jobs.length, "later:", lane?.laterJobCount);
  for (const job of lane?.jobs.slice(-3) ?? []) {
    console.log(
      job.proposalNumber,
      "start",
      job.schedule?.estimatedStart?.slice(0, 19),
      "end",
      job.schedule?.estimatedEnd?.slice(0, 19),
    );
  }
}

main().catch(console.error);
