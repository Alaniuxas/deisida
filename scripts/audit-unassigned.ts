import { db, initializeDatabase } from "../src/lib/db";
import {
  jobs,
  machines,
  proposals,
  queuePlanItems,
  queuePlanRuns,
} from "../src/lib/db/schema";
import { desc, eq, inArray } from "drizzle-orm";
import { scheduleQueue } from "../src/lib/queue/schedule";
import {
  CHANGEOVER_ASSIGN_MAX_GAP_MM,
  WIDTH_SETUP_TOLERANCE_MM,
} from "../src/lib/queue/machine-width";
import { DEFAULT_CHANGEOVER_MINUTES } from "../src/lib/queue/constants";

async function main() {
  initializeDatabase();

  const [run] = await db
    .select()
    .from(queuePlanRuns)
    .orderBy(desc(queuePlanRuns.generatedAt))
    .limit(1);
  if (!run) {
    console.log("No plan run");
    return;
  }

  const [open, machineRows, planItems, propRows] = await Promise.all([
    db
      .select()
      .from(jobs)
      .where(inArray(jobs.status, ["queued", "in_progress"])),
    db.select().from(machines),
    db
      .select()
      .from(queuePlanItems)
      .where(eq(queuePlanItems.runId, run.id)),
    db.select().from(proposals),
  ]);

  const propById = new Map(propRows.map((row) => [row.id, row]));
  const planJobIds = new Set(planItems.map((item) => item.jobId));
  const machineById = new Map(machineRows.map((machine) => [machine.id, machine]));

  const plannerMachines = machineRows.map((machine) => ({
    id: machine.id,
    currentWidthMm: machine.currentWidthMm ?? 0,
    dailyRatePieces: machine.dailyRate,
    changeoverMinutes: DEFAULT_CHANGEOVER_MINUTES,
    piecesPerDay: machine.piecesPerDay ?? undefined,
  }));

  const plannerJobs = open.map((job) => ({
    id: job.id,
    tileWidthMm: job.widthMm,
    storisMm: job.storisMm,
    quantityPallets: 1,
    pieceCount: job.pieceCount,
    deadline: job.deadline,
    cutType: "",
    proposalId: job.proposalId,
    pinnedMachineId:
      job.status === "in_progress" ? job.machineId ?? undefined : undefined,
  }));

  const assignments = scheduleQueue(plannerMachines, plannerJobs, {
    lockedWeek: {
      startIso: run.lockedWeekStart,
      endIso: run.lockedWeekEnd,
    },
  });
  const assignMap = new Map(assignments.map((row) => [row.jobId, row]));

  const notInPlan = open.filter((job) => !planJobIds.has(job.id));

  console.log("Plan:", run.lockedWeekStart, "→", run.lockedWeekEnd);
  console.log(
    "Magnets:",
    machineRows
      .map((machine) => `${machine.code}@${machine.currentWidthMm ?? 0}mm`)
      .join(", "),
  );
  console.log(
    `Open ${open.length}, plan items ${planItems.length}, scheduleQueue ${assignments.length}, missing from plan ${notInPlan.length}`,
  );
  console.log("");

  console.log("Plan generated at:", run.generatedAt);
  console.log("");

  for (const job of notInPlan) {
    const proposal = propById.get(job.proposalId);
    const pn = proposal?.number ?? job.id;
    const live = assignMap.get(job.id);
    const liveMachine = live
      ? machineById.get(live.machineId)?.code
      : null;

    console.log(
      `=== ${pn} | ${job.widthMm} mm | ${job.pieceCount} vnt | terminas ${job.deadline}`,
    );
    console.log(
      `  pasiūlymas: status=${proposal?.status ?? "?"} created=${proposal?.createdAt ?? "?"}`,
    );
    console.log(`  queue_plan_items: MISSING`);
    console.log(
      `  scheduleQueue now: ${liveMachine ?? "NOT ASSIGNED"}${live ? ` @ ${live.estimatedStart.toISOString().slice(0, 16)}` : ""}`,
    );

    const exact = machineRows.filter(
      (machine) =>
        Math.abs((machine.currentWidthMm ?? 0) - job.widthMm) <=
        WIDTH_SETUP_TOLERANCE_MM,
    );
    const changeover = machineRows.filter((machine) => {
      const gap = Math.abs((machine.currentWidthMm ?? 0) - job.widthMm);
      return (
        gap > WIDTH_SETUP_TOLERANCE_MM && gap <= CHANGEOVER_ASSIGN_MAX_GAP_MM
      );
    });
    const nearest = machineRows
      .map((machine) => ({
        code: machine.code,
        gap: Math.abs((machine.currentWidthMm ?? 0) - job.widthMm),
      }))
      .sort((left, right) => left.gap - right.gap);

    console.log(
      `  ±5 mm: ${exact.map((m) => `${m.code}@${m.currentWidthMm}`).join(", ") || "none"}`,
    );
    console.log(
      `  6–15 mm: ${changeover.map((m) => `${m.code}@${m.currentWidthMm}`).join(", ") || "none"}`,
    );
    console.log(
      `  nearest: ${nearest.slice(0, 3).map((m) => `${m.code} Δ${m.gap}`).join(", ")}`,
    );
    console.log("");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
