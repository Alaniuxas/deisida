import { desc, eq } from "drizzle-orm";
import { db } from "../src/lib/db";
import {
  jobs,
  machineDowntimes,
  machines,
  proposals,
  queuePlanItems,
  queuePlanRuns,
} from "../src/lib/db/schema";
import { cutByIsoFromDate } from "../src/lib/queue/format";
import { buildDowntimeWindows } from "../src/lib/queue/downtime-redistribute";

async function main() {
  const downtimes = await db
    .select({ d: machineDowntimes, m: machines })
    .from(machineDowntimes)
    .innerJoin(machines, eq(machineDowntimes.machineId, machines.id))
    .orderBy(desc(machineDowntimes.createdAt));

  const [run] = await db
    .select()
    .from(queuePlanRuns)
    .orderBy(desc(queuePlanRuns.generatedAt))
    .limit(1);
  if (!run) return;

  const rows = await db
    .select({
      item: queuePlanItems,
      job: jobs,
      machine: machines,
      proposalNumber: proposals.number,
    })
    .from(queuePlanItems)
    .innerJoin(jobs, eq(queuePlanItems.jobId, jobs.id))
    .innerJoin(machines, eq(queuePlanItems.machineId, machines.id))
    .innerJoin(proposals, eq(jobs.proposalId, proposals.id))
    .where(eq(queuePlanItems.runId, run.id));

  console.log("=== TERMINŲ ATITIKIMAS (planuojama pabaiga vs terminas) ===\n");

  let onTime = 0;
  let late = 0;
  const lateRows: typeof rows = [];

  for (const row of rows) {
    const cutBy = cutByIsoFromDate(row.job.deadline);
    const plannedEnd = new Date(row.item.plannedEnd);
    const deadlineEnd = new Date(cutBy);
    if (plannedEnd.getTime() <= deadlineEnd.getTime()) {
      onTime += 1;
    } else {
      late += 1;
      lateRows.push(row);
    }
  }

  console.log(`Laiku (pabaiga ≤ terminas): ${onTime}`);
  console.log(`Vėluoja (pabaiga > terminas): ${late}`);

  if (lateRows.length > 0) {
    console.log("\nVėluojantys (pirmi 15):");
    for (const row of lateRows.slice(0, 15)) {
      console.log(
        `  ${row.proposalNumber} · ${row.machine.code} · ${row.item.widthMm} mm · terminas ${row.job.deadline} · pabaiga ${row.item.plannedEnd.slice(0, 16)}`,
      );
    }
  }

  if (downtimes.length === 0) {
    console.log("\nNėra aktyvaus gedimo.");
    return;
  }

  const down = downtimes[0];
  const window = buildDowntimeWindows([down.d]).get(down.d.machineId)!;

  const affected = rows.filter(
    (row) =>
      row.job.status === "queued" &&
      new Date(row.item.plannedStart).getTime() < window.endAt.getTime() &&
      row.machine.code !== down.m.code,
  );

  console.log(`\n=== GEDIMO METU PERKELTI / PASTUMTI (${down.m.code} gedimas) ===`);
  console.log(`Darbai kitose staklėse su pradžia < ${down.d.endAt.slice(0, 16)}: ${affected.length}\n`);

  const byMachine = new Map<string, typeof rows>();
  for (const row of affected) {
    const list = byMachine.get(row.machine.code) ?? [];
    list.push(row);
    byMachine.set(row.machine.code, list);
  }

  for (const [code, list] of [...byMachine.entries()].sort()) {
    console.log(`${code} (${list.length} darb.):`);
    for (const row of list.slice(0, 8)) {
      const cutBy = cutByIsoFromDate(row.job.deadline);
      const ok =
        new Date(row.item.plannedEnd).getTime() <= new Date(cutBy).getTime()
          ? "✓ laiku"
          : "⚠ po termino";
      console.log(
        `  ${row.proposalNumber} ${row.item.widthMm}mm · pradžia ${row.item.plannedStart.slice(0, 16)} · pabaiga ${row.item.plannedEnd.slice(0, 16)} · terminas ${row.job.deadline} · ${ok}`,
      );
    }
    if (list.length > 8) {
      console.log(`  … ir dar ${list.length - 8}`);
    }
    console.log("");
  }
}

main().catch(console.error);
