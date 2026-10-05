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
  const stressJobs = await db
    .select({
      number: proposals.number,
      widthMm: jobs.widthMm,
      jobId: jobs.id,
    })
    .from(jobs)
    .innerJoin(proposals, eq(proposals.id, jobs.proposalId))
    .where(like(proposals.number, "STRESS-%"));

  const plan = await db
    .select({
      jobId: queuePlanItems.jobId,
      machineId: queuePlanItems.machineId,
      code: machines.code,
    })
    .from(queuePlanItems)
    .innerJoin(machines, eq(machines.id, queuePlanItems.machineId));

  const planByJob = new Map(plan.map((row) => [row.jobId, row.code]));

  const byMachine = new Map<string, { number: string; width: number }[]>();
  for (const job of stressJobs) {
    const code = planByJob.get(job.jobId) ?? "?";
    const list = byMachine.get(code) ?? [];
    list.push({ number: job.number, width: job.widthMm });
    byMachine.set(code, list);
  }

  for (const [code, list] of [...byMachine.entries()].sort()) {
    console.log(
      code,
      list.map((item) => `${item.number.split("-").slice(-2).join("-")}=${item.width}`).join(", "),
    );
  }
}

main();
