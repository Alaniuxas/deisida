import { db } from "../src/lib/db/index";
import {
  jobs,
  proposals,
  queuePlanItems,
  queuePlanRuns,
  machines,
} from "../src/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { getScheduledQueue } from "../src/lib/queue/service";

async function main() {
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
  const machineRows = await db.select().from(machines);
  const mById = new Map(machineRows.map((m) => [m.id, m.code]));

  const nk1 = machineRows.find((m) => m.code === "NK1")!;
  const nk1Items = items
    .filter((i) => i.machineId === nk1.id && i.lockedWeek)
    .sort((a, b) => a.plannedStart.localeCompare(b.plannedStart));

  console.log("=== NK1 locked-week plan items ===");
  for (const item of nk1Items) {
    const [job] = await db.select().from(jobs).where(eq(jobs.id, item.jobId)).limit(1);
    const [prop] = job
      ? await db.select().from(proposals).where(eq(proposals.id, job.proposalId)).limit(1)
      : [null];
    console.log(
      prop?.number,
      item.jobId.slice(0, 8),
      `w${item.widthMm}`,
      `start=${item.plannedStart}`,
      `end=${item.plannedEnd}`,
      `sameStartAsPrev=${nk1Items.indexOf(item) > 0 && item.plannedStart === nk1Items[nk1Items.indexOf(item) - 1].plannedStart}`,
    );
  }

  const queue = await getScheduledQueue();
  const lane = queue.lanes.find((l) => l.code === "NK1");
  console.log("\n=== NK1 display ===");
  for (const j of lane?.jobs.filter((x) => x.proposalNumber.includes("240710")) ?? []) {
    console.log(
      j.proposalNumber,
      j.id.slice(0, 8),
      `w${j.widthMm}`,
      `start=${j.schedule?.estimatedStart}`,
      `end=${j.schedule?.estimatedEnd}`,
      j.schedule?.priority,
    );
  }
}

main().catch(console.error);
