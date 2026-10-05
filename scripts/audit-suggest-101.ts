import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { jobs, machines, queuePlanItems, queuePlanRuns } from "@/lib/db/schema";
import { suggestMoveTargets } from "@/lib/queue/suggest-move";
import { SHOP_MACHINE_ORDER } from "@/lib/queue/constants";

async function main() {
  const jobRows = await db.select().from(jobs).where(eq(jobs.widthMm, 101));
  console.log(
    "Jobs 101mm:",
    jobRows.map((job) => ({
      id: job.id,
      pieces: job.pieceCount,
      machineId: job.machineId,
      deadline: job.deadline,
    })),
  );

  const target =
    jobRows.find((job) => job.pieceCount === 8000 && job.deadline === "2026-10-14") ??
    jobRows.find((job) => job.pieceCount >= 8000) ??
    jobRows[0];
  if (!target) {
    console.log("No 101mm job found");
    return;
  }
  console.log("Target job:", target.id, target.pieceCount, target.deadline);

  const [run] = await db.select().from(queuePlanRuns).limit(1);
  if (!run) {
    console.log("No plan run");
    return;
  }
  console.log("Plan run:", run.id);

  const planItems = await db
    .select()
    .from(queuePlanItems)
    .where(eq(queuePlanItems.runId, run.id));

  const planItem = planItems.find((item) => item.jobId === target.id);
  console.log("Plan item for target:", planItem?.machineId, planItem?.plannedStart, planItem?.plannedEnd);

  const machineRows = await db.select().from(machines);
  const shopMachines = machineRows
    .filter((machine) =>
      (SHOP_MACHINE_ORDER as readonly string[]).includes(machine.code),
    )
    .sort(
      (left, right) =>
        SHOP_MACHINE_ORDER.indexOf(left.code as (typeof SHOP_MACHINE_ORDER)[number]) -
        SHOP_MACHINE_ORDER.indexOf(right.code as (typeof SHOP_MACHINE_ORDER)[number]),
    );

  const jobIds = planItems.map((item) => item.jobId);
  const allJobs =
    jobIds.length > 0
      ? await db.select().from(jobs).where(inArray(jobs.id, jobIds))
      : [];
  const jobById = new Map(allJobs.map((row) => [row.id, row]));

  const laneJobsByMachine = new Map<
    string,
    Array<{
      jobId: string;
      widthMm: number;
      pieceCount: number;
      quantityPallets: number;
      estimatedStart: Date;
      estimatedEnd: Date;
      status?: string;
    }>
  >();

  for (const item of planItems) {
    const row = jobById.get(item.jobId);
    if (!row) continue;
    const list = laneJobsByMachine.get(item.machineId) ?? [];
    list.push({
      jobId: item.jobId,
      widthMm: item.widthMm || row.widthMm,
      pieceCount: row.pieceCount,
      quantityPallets: 1,
      estimatedStart: new Date(item.plannedStart),
      estimatedEnd: new Date(item.plannedEnd),
      status: row.status,
    });
    laneJobsByMachine.set(item.machineId, list);
  }

  for (const machine of shopMachines) {
    const lane = laneJobsByMachine.get(machine.id) ?? [];
    console.log(
      `\n${machine.code} (magnet ${machine.currentWidthMm}mm) — ${lane.length} jobs in plan`,
    );
    for (const laneJob of lane.slice(0, 5)) {
      console.log(
        `  ${laneJob.widthMm}mm x${laneJob.pieceCount} ${laneJob.estimatedStart.toISOString().slice(0, 10)} → ${laneJob.estimatedEnd.toISOString().slice(0, 10)}${laneJob.jobId === target.id ? " <-- TARGET" : ""}`,
      );
    }
    if (lane.length > 5) console.log(`  ... +${lane.length - 5} more`);
  }

  const deadlines = [
    "2026-10-06T17:00:00+03:00",
    "2026-10-07T17:00:00+03:00",
    "2026-10-08T17:00:00+03:00",
    "2026-10-09T17:00:00+03:00",
    "2026-10-10T17:00:00+03:00",
    "2026-10-14T17:00:00+03:00",
    "2026-10-29T17:00:00+03:00",
    "2026-11-12T17:00:00+03:00",
  ];

  for (const cutBy of deadlines) {
    const suggestions = suggestMoveTargets({
      movingJob: {
        jobId: target.id,
        widthMm: target.widthMm,
        pieceCount: target.pieceCount,
        quantityPallets: 1,
        fromMachineId: planItem?.machineId ?? "",
      },
      cutByIso: cutBy,
      machines: shopMachines.map((machine) => ({
        id: machine.id,
        code: machine.code,
        currentWidthMm: machine.currentWidthMm ?? 0,
        dailyRatePieces: machine.dailyRate,
        piecesPerDay: machine.piecesPerDay ?? undefined,
      })),
      laneJobsByMachine,
    });
    const recommended = suggestions?.find((row) => row.recommended);
    console.log(`\n=== cutBy ${cutBy.slice(0, 10)} ===`);
    console.log(
      "recommended:",
      recommended?.machineCode,
      recommended?.estimatedFinishIso,
      recommended?.reason,
    );
    for (const row of suggestions ?? []) {
      console.log(
        `  ${row.machineCode}${row.recommended ? " *" : ""} gap=${row.widthGapMm} ch=${row.requiresChangeover} finish=${row.estimatedFinishIso?.slice(0, 16)}`,
      );
    }
  }
}

main().catch(console.error);
