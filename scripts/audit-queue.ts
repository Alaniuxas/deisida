import { db } from "../src/lib/db/index";
import { jobs, machines, queuePlanRuns, queuePlanItems } from "../src/lib/db/schema";
import { eq, desc, inArray } from "drizzle-orm";
import { getScheduledQueue } from "../src/lib/queue/service";
import { isTimestampInLockedWeek } from "../src/lib/queue/week";

async function main() {
  const machineRows = await db.select().from(machines).orderBy(machines.code);
  console.log("=== MACHINES ===");
  for (const m of machineRows) {
    console.log(
      `${m.code} id=${m.id} width=${m.currentWidthMm} rate=${m.dailyRate}`,
    );
  }

  const openJobs = await db
    .select()
    .from(jobs)
    .where(inArray(jobs.status, ["queued", "in_progress"]));
  console.log(`\n=== OPEN JOBS: ${openJobs.length} ===`);
  for (const j of openJobs) {
    console.log(
      `${j.id.slice(0, 8)} width=${j.widthMm} storis=${j.storisMm} status=${j.status} machineId=${j.machineId} deadline=${j.deadline}`,
    );
  }

  const [run] = await db
    .select()
    .from(queuePlanRuns)
    .orderBy(desc(queuePlanRuns.generatedAt))
    .limit(1);
  if (run) {
    console.log("\n=== LATEST PLAN RUN ===");
    console.log(`id: ${run.id.slice(0, 8)}`);
    console.log(`status: ${run.status}`);
    console.log(`locked week: ${run.lockedWeekStart} -> ${run.lockedWeekEnd}`);
    console.log(`generated: ${run.generatedAt}`);

    const items = await db
      .select()
      .from(queuePlanItems)
      .where(eq(queuePlanItems.runId, run.id));
    console.log("\n=== PLAN ITEMS BY MACHINE ===");
    const byMachine = new Map<string, typeof items>();
    for (const item of items) {
      const list = byMachine.get(item.machineId) ?? [];
      list.push(item);
      byMachine.set(item.machineId, list);
    }
    const week = { startIso: run.lockedWeekStart, endIso: run.lockedWeekEnd };
    for (const m of machineRows) {
      const list = byMachine.get(m.id) ?? [];
      console.log(
        `${m.code}: ${list.length} jobs`,
        list
          .map(
            (i) =>
              `w${i.widthMm} locked=${i.lockedWeek} inWeek=${isTimestampInLockedWeek(i.plannedStart, week)} start=${i.plannedStart.slice(0, 16)}`,
          )
          .join(" | "),
      );
    }
    const notInPlan = openJobs.filter(
      (j) => !items.find((i) => i.jobId === j.id),
    );
    console.log(
      `\nJobs NOT in plan: ${notInPlan.map((j) => j.id.slice(0, 8)).join(", ") || "none"}`,
    );
  } else {
    console.log("\n=== NO PLAN RUN ===");
  }

  const queue = await getScheduledQueue();
  console.log("\n=== DISPLAY QUEUE (getScheduledQueue) ===");
  console.log(`locked week: ${queue.lockedWeekStart} -> ${queue.lockedWeekEnd}`);
  console.log(`laterLockedCount: ${queue.laterLockedCount}`);
  for (const lane of queue.lanes) {
    console.log(
      `${lane.code}: ${lane.jobs.length} visible, laterJobCount=${lane.laterJobCount}`,
    );
    for (const j of lane.jobs) {
      console.log(
        `   ${j.id.slice(0, 8)} ${j.proposalNumber} w${j.widthMm} start=${j.schedule?.estimatedStart?.slice(0, 16)}`,
      );
    }
  }

  if (run) {
    const items = await db
      .select()
      .from(queuePlanItems)
      .where(eq(queuePlanItems.runId, run.id));
    const s2 = machineRows.find((m) => m.code === "S2");
    if (s2) {
      console.log("\n=== S2 PLAN vs DISPLAY DETAIL ===");
      const s2Items = items
        .filter((i) => i.machineId === s2.id)
        .sort((a, b) => a.plannedStart.localeCompare(b.plannedStart));
      for (const item of s2Items) {
        const displayed = queue.lanes
          .find((l) => l.code === "S2")
          ?.jobs.find((j) => j.id === item.jobId);
        console.log(
          `${item.jobId.slice(0, 8)} w${item.widthMm} planLocked=${item.lockedWeek} planStart=${item.plannedStart.slice(0, 16)} displayed=${displayed ? "YES start=" + displayed.schedule?.estimatedStart?.slice(0, 16) : "NO"}`,
        );
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
