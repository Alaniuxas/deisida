import { db, initializeDatabase } from "../src/lib/db";
import { jobs, machines, queuePlanItems, queuePlanRuns } from "../src/lib/db/schema";
import { desc, eq, inArray } from "drizzle-orm";
import { WIDTH_SETUP_TOLERANCE_MM } from "../src/lib/queue/machine-width";
import { durationHoursFromPlan } from "../src/lib/queue/work-hours";

async function main() {
  initializeDatabase();
  const machineRows = await db.select().from(machines);
  const nk1 = machineRows.find((m) => m.code === "NK1");
  if (!nk1) {
    console.log("NK1 not found");
    return;
  }

  const open = await db
    .select()
    .from(jobs)
    .where(inArray(jobs.status, ["queued", "in_progress"]));

  const compatible = open.filter(
    (j) => Math.abs(j.widthMm - (nk1.currentWidthMm ?? 0)) <= WIDTH_SETUP_TOLERANCE_MM,
  );

  console.log("=== NK1 ===");
  console.log("stored width:", nk1.currentWidthMm, "rate:", nk1.dailyRate, "pieces/day:", nk1.piecesPerDay);

  console.log("\n=== ALL OPEN JOBS BY WIDTH (count) ===");
  const byWidth = new Map<number, number>();
  for (const j of open) {
    byWidth.set(j.widthMm, (byWidth.get(j.widthMm) ?? 0) + 1);
  }
  for (const [w, c] of [...byWidth.entries()].sort((a, b) => a[0] - b[0])) {
    const fitsNk1 = Math.abs(w - (nk1.currentWidthMm ?? 0)) <= WIDTH_SETUP_TOLERANCE_MM;
    console.log(`  w${w}: ${c} jobs${fitsNk1 ? " ← NK1 eligible" : ""}`);
  }

  console.log("\n=== NK1-ELIGIBLE JOBS ===", compatible.length);
  for (const j of compatible) {
    console.log(`  w${j.widthMm} pieces=${j.pieceCount} deadline=${j.deadline}`);
  }

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

  const nk1Items = items
    .filter((i) => i.machineId === nk1.id)
    .sort((a, b) => a.plannedStart.localeCompare(b.plannedStart));

  console.log("\n=== NK1 PLAN (locked week:", run.lockedWeekStart, "→", run.lockedWeekEnd, ") ===");
  for (const i of nk1Items) {
    const j = open.find((r) => r.id === i.jobId);
    const hrs = durationHoursFromPlan(i.plannedStart, i.plannedEnd);
    console.log(
      `  ${i.plannedStart.slice(0, 16)} → ${i.plannedEnd.slice(11, 16)}`,
      `w${j?.widthMm}`,
      `${j?.pieceCount}vnt`,
      `${hrs.toFixed(1)}h`,
      `deadline=${j?.deadline}`,
      `locked=${i.lockedWeek}`,
    );
  }

  const last = nk1Items[nk1Items.length - 1];
  if (last) {
    console.log("\nNK1 last job ends:", last.plannedEnd.slice(0, 16));
  }

  console.log("\n=== OTHER MACHINES - eligible jobs NOT on NK1 ===");
  for (const j of compatible) {
    const item = items.find((i) => i.jobId === j.id);
    const m = machineRows.find((x) => x.id === item?.machineId);
    if (m && m.id !== nk1.id) {
      console.log(`  w${j.widthMm} on ${m.code} (should be NK1?)`);
    }
  }
}

main();
