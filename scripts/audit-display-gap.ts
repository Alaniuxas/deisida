import { db } from "../src/lib/db/index";
import { jobs, machines, queuePlanRuns } from "../src/lib/db/schema";
import { desc, eq, inArray } from "drizzle-orm";
import { scheduleQueue } from "../src/lib/queue/schedule";
import type { Machine, QueueJob } from "../src/lib/queue/types";
import { DEFAULT_CHANGEOVER_MINUTES } from "../src/lib/queue/constants";
import { lockedWeekForPlanner } from "../src/lib/queue/week";
import { plannerReferenceTime } from "../src/lib/queue/balance";

async function loadJobs(): Promise<QueueJob[]> {
  const rows = await db
    .select()
    .from(jobs)
    .where(inArray(jobs.status, ["queued", "in_progress"]));
  return rows.map((job) => ({
    id: job.id,
    tileWidthMm: job.widthMm,
    storisMm: job.storisMm,
    quantityPallets: 1,
    pieceCount: job.pieceCount,
    deadline: job.deadline,
    cutType: "",
    proposalId: job.proposalId,
  }));
}

async function main() {
  const machineRows = await db.select().from(machines);
  const plannerMachines: Machine[] = machineRows.map((machine) => ({
    id: machine.id,
    currentWidthMm: machine.currentWidthMm ?? 0,
    dailyRatePieces: machine.dailyRate,
    changeoverMinutes: DEFAULT_CHANGEOVER_MINUTES,
    piecesPerDay: machine.piecesPerDay ?? undefined,
  }));
  const jobRows = await loadJobs();

  const bare = scheduleQueue(plannerMachines, jobRows);
  const lockedWeek = lockedWeekForPlanner(new Date("2026-10-02T20:00:00+03:00"));
  const withPlan = scheduleQueue(plannerMachines, jobRows, {
    referenceTime: plannerReferenceTime(new Date("2026-10-02T20:00:00+03:00"), lockedWeek),
    lockedWeek,
    balanceLockedWeek: true,
  });

  console.log(`jobs: ${jobRows.length}`);
  console.log(`scheduleQueue (display/default): ${bare.length}`);
  console.log(`scheduleQueue (plan options): ${withPlan.length}`);

  const { assignJobsWithLoadBalance } = await import("../src/lib/queue/balance");
  const { assignWidthsToMachines } = await import("../src/lib/queue/schedule");
  const states = plannerMachines.map((machine) => ({
    ...machine,
    plannedWidthMm: null as number | null,
    assignedJobs: [] as QueueJob[],
  }));
  const widthAssignment = assignWidthsToMachines(states, jobRows);
  assignJobsWithLoadBalance(states, jobRows, widthAssignment);
  const assignedCount = states.reduce((sum, machine) => sum + machine.assignedJobs.length, 0);
  console.log(`assignJobsWithLoadBalance assigned: ${assignedCount}/${jobRows.length}`);
  for (const machine of machineRows) {
    const state = states.find((row) => row.id === machine.id);
    console.log(`  ${machine.code}: ${state?.assignedJobs.length ?? 0} jobs @ ${machine.currentWidthMm}mm`);
  }
}

main();
