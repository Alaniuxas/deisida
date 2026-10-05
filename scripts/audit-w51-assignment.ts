import { db, initializeDatabase } from "../src/lib/db";
import { machines, proposals, jobs } from "../src/lib/db/schema";
import { eq } from "drizzle-orm";
import { ensureCuttingNorms, ensureShopMachines } from "../src/lib/queue/excel-norms";
import { scheduleQueue } from "../src/lib/queue/schedule";
import { plannerReferenceTime } from "../src/lib/queue/balance";
import { lockedWeekForPlanner } from "../src/lib/queue/week";
import { DEFAULT_CHANGEOVER_MINUTES } from "../src/lib/queue/constants";

async function main(): Promise<void> {
  initializeDatabase();
  await ensureShopMachines();
  await ensureCuttingNorms();

  const now = new Date("2026-10-02T12:00:00+03:00");
  const lockedWeek = lockedWeekForPlanner(now);
  const machineRows = await db.select().from(machines);
  const codeById = new Map(machineRows.map((m) => [m.id, m.code]));

  const jobRows = await db
    .select({ job: jobs, proposalNumber: proposals.number })
    .from(jobs)
    .innerJoin(proposals, eq(jobs.proposalId, proposals.id))
    .where(eq(jobs.status, "queued"));

  const plannerMachines = machineRows.map((machine) => ({
    id: machine.id,
    currentWidthMm: machine.currentWidthMm ?? 0,
    dailyRatePieces: machine.dailyRate,
    changeoverMinutes: DEFAULT_CHANGEOVER_MINUTES,
    piecesPerDay: machine.piecesPerDay ?? undefined,
  }));

  const plannerJobs = jobRows.map((row) => ({
    id: row.job.id,
    tileWidthMm: row.job.widthMm,
    storisMm: row.job.storisMm,
    quantityPallets: 1,
    pieceCount: row.job.pieceCount,
    deadline: row.job.deadline,
    cutType: "",
    proposalId: row.job.proposalId,
  }));

  const assignments = scheduleQueue(plannerMachines, plannerJobs, {
    referenceTime: plannerReferenceTime(now, lockedWeek),
    lockedWeek,
    balanceLockedWeek: true,
  });

  console.log("Machine widths:", machineRows.map((m) => `${m.code}=${m.currentWidthMm}mm`).join(", "));
  console.log("\nw51 assignments:");
  for (const row of jobRows.filter((r) => r.job.widthMm === 51)) {
    const a = assignments.find((x) => x.jobId === row.job.id);
    console.log(
      row.proposalNumber,
      "→",
      codeById.get(a?.machineId ?? "?"),
      "chg",
      a?.changeoverHours,
      "h",
    );
  }

  console.log("\nNK1 lane:");
  for (const a of assignments
    .filter((x) => codeById.get(x.machineId) === "NK1")
    .sort((l, r) => l.estimatedStart.getTime() - r.estimatedStart.getTime())
    .slice(0, 8)) {
    const row = jobRows.find((r) => r.job.id === a.jobId);
    console.log(
      row?.proposalNumber,
      "w" + a.tileWidthMm,
      "chg=" + a.changeoverHours,
      "P" + a.priority,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
