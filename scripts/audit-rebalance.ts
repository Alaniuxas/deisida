import { desc, eq } from "drizzle-orm";
import { db, initializeDatabase } from "../src/lib/db";
import {
  machines,
  queueOverrides,
  queuePlanItems,
  queuePlanRuns,
} from "../src/lib/db/schema";
import { isJobCompatibleWithStoredSetup } from "../src/lib/queue/machine-width";

async function main(): Promise<void> {
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

  const machineRows = await db.select().from(machines);
  const codeById = new Map(machineRows.map((m) => [m.id, m.code]));
  const widthById = new Map(machineRows.map((m) => [m.id, m.currentWidthMm]));

  const items = await db
    .select()
    .from(queuePlanItems)
    .where(eq(queuePlanItems.runId, run.id));

  const locked = items.filter((item) => item.lockedWeek);
  const byMachine = new Map<string, typeof locked>();
  for (const item of locked) {
    const list = byMachine.get(item.machineId) ?? [];
    list.push(item);
    byMachine.set(item.machineId, list);
  }

  console.log("=== LOCKED WEEK JOB COUNT ===");
  for (const machine of machineRows) {
    const jobs = byMachine.get(machine.id) ?? [];
    const widths = jobs.map((j) => `w${j.widthMm}`).join(", ");
    console.log(
      `${machine.code}: ${jobs.length} jobs @ ${machine.currentWidthMm}mm — ${widths}`,
    );
  }

  console.log("\n=== POSSIBLE REBALANCE MOVES (gap >= 2) ===");
  const ranked = [...byMachine.entries()].sort(
    (a, b) => b[1].length - a[1].length,
  );
  for (const [donorId, donorItems] of ranked) {
    for (const [receiverId, receiverItems] of ranked) {
      if (donorId === receiverId) continue;
      if (donorItems.length - receiverItems.length < 2) continue;
      const receiverWidth = widthById.get(receiverId);
      const compatible = donorItems.filter((item) =>
        isJobCompatibleWithStoredSetup(item.widthMm, receiverWidth),
      );
      const donorCode = codeById.get(donorId);
      const receiverCode = codeById.get(receiverId);
      console.log(
        `${donorCode}(${donorItems.length}) → ${receiverCode}(${receiverItems.length}) @ ${receiverWidth}mm: ${compatible.length} compatible`,
      );
      for (const item of compatible.slice(0, 3)) {
        console.log(`  - w${item.widthMm} job ${item.jobId.slice(0, 8)}`);
      }
    }
  }

  const overrides = await db
    .select()
    .from(queueOverrides)
    .where(eq(queueOverrides.runId, run.id))
    .orderBy(desc(queueOverrides.createdAt));

  console.log("\n=== OVERRIDES THIS RUN ===");
  if (overrides.length === 0) {
    console.log("(none)");
  }
  for (const row of overrides) {
    console.log(
      `${codeById.get(row.fromMachineId)} → ${codeById.get(row.toMachineId)} | ${row.reason} | ${row.createdAt}`,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
