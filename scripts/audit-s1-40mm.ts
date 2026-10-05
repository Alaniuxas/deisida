import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { jobs, machines, proposals, queuePlanItems, queuePlanRuns } from "@/lib/db/schema";
import { suggestMoveTargets } from "@/lib/queue/suggest-move";
import { SHOP_MACHINE_ORDER } from "@/lib/queue/constants";

async function main() {
  const jobRows = await db.select().from(jobs).where(eq(jobs.widthMm, 40));
  const target =
    jobRows.find((job) => job.pieceCount === 8000) ??
    jobRows.find((job) => job.pieceCount >= 8000) ??
    jobRows[0];
  if (!target) {
    console.log("No 40mm job");
    return;
  }

  const [run] = await db.select().from(queuePlanRuns).limit(1);
  if (!run) return;

  const planItems = await db
    .select()
    .from(queuePlanItems)
    .where(eq(queuePlanItems.runId, run.id));

  const machineRows = await db.select().from(machines);
  const shopMachines = machineRows
    .filter((m) => (SHOP_MACHINE_ORDER as readonly string[]).includes(m.code))
    .sort(
      (a, b) =>
        SHOP_MACHINE_ORDER.indexOf(a.code as (typeof SHOP_MACHINE_ORDER)[number]) -
        SHOP_MACHINE_ORDER.indexOf(b.code as (typeof SHOP_MACHINE_ORDER)[number]),
    );

  const jobIds = planItems.map((i) => i.jobId);
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

  const s1 = shopMachines.find((m) => m.code === "S1");
  if (s1) {
    const s1Items = planItems
      .filter((i) => i.machineId === s1.id)
      .sort(
        (a, b) =>
          new Date(a.plannedStart).getTime() - new Date(b.plannedStart).getTime(),
      );
    const widthCounts = new Map<number, number>();
    for (const item of s1Items) {
      const row = jobById.get(item.jobId);
      const w = item.widthMm || row?.widthMm || 0;
      widthCounts.set(w, (widthCounts.get(w) ?? 0) + 1);
    }
    console.log("S1 jobs:", s1Items.length, "magnet", s1.currentWidthMm);
    console.log("Widths:", [...widthCounts.entries()].sort((a, b) => b[1] - a[1]));
    const last = s1Items.at(-1);
    console.log("S1 last end:", last?.plannedEnd);
  }

  const planItem = planItems.find((i) => i.jobId === target.id);
  console.log("\nTarget:", target.id, target.pieceCount, "plan:", planItem?.plannedStart, "→", planItem?.plannedEnd);

  for (const cutBy of [
    "2026-10-12T17:00:00+03:00",
    "2026-12-18T17:00:00+03:00",
  ]) {
    const suggestions = suggestMoveTargets({
      movingJob: {
        jobId: target.id,
        widthMm: target.widthMm,
        pieceCount: target.pieceCount,
        quantityPallets: 1,
        fromMachineId: planItem?.machineId ?? "",
      },
      cutByIso: cutBy,
      machines: shopMachines.map((m) => ({
        id: m.id,
        code: m.code,
        currentWidthMm: m.currentWidthMm ?? 0,
        dailyRatePieces: m.dailyRate,
        piecesPerDay: m.piecesPerDay ?? undefined,
      })),
      laneJobsByMachine,
    });
    const rec = suggestions.find((s) => s.recommended);
    console.log(`\n=== ${cutBy.slice(0, 10)} → ${rec?.machineCode} finish ${rec?.estimatedFinishIso?.slice(0, 16)} gap=${rec?.widthGapMm} ch=${rec?.requiresChangeover}`);
    for (const s of suggestions) {
      console.log(`  ${s.machineCode}${s.recommended ? " *" : ""} gap=${s.widthGapMm} ch=${s.requiresChangeover} finish=${s.estimatedFinishIso?.slice(0, 16)}`);
    }
  }
}

main().catch(console.error);
