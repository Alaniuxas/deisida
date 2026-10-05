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
import {
  buildDowntimeWindows,
  shouldMoveJobForDowntime,
} from "../src/lib/queue/downtime-redistribute";
import type { Assignment } from "../src/lib/queue/types";

function toAssignment(
  row: {
    item: typeof queuePlanItems.$inferSelect;
    job: typeof jobs.$inferSelect;
    machineId: string;
  },
): Assignment {
  return {
    jobId: row.item.jobId,
    machineId: row.machineId,
    proposalId: row.job.proposalId,
    cutType: "",
    tileWidthMm: row.item.widthMm,
    storisMm: row.item.storisMm,
    quantityPallets: 1,
    durationHours: 0,
    changeoverHours: 0,
    estimatedStart: new Date(row.item.plannedStart),
    estimatedEnd: new Date(row.item.plannedEnd),
    pickCriterion: "width",
    pickStartHours: 0,
    otherMachineId: null,
    otherStartHours: null,
    priority: "P3",
  };
}

async function main() {
  const downtimes = await db
    .select({ d: machineDowntimes, m: machines })
    .from(machineDowntimes)
    .innerJoin(machines, eq(machineDowntimes.machineId, machines.id))
    .orderBy(desc(machineDowntimes.createdAt));

  if (downtimes.length === 0) {
    console.log("Nėra aktyvių gedimų.");
    return;
  }

  const down = downtimes[0];
  const windows = buildDowntimeWindows([down.d]);
  const window = windows.get(down.d.machineId)!;

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

  const onDownMachine = rows.filter((row) => row.machine.id === down.d.machineId);
  const shouldHaveMoved = onDownMachine.filter((row) =>
    row.job.status === "queued" &&
    shouldMoveJobForDowntime(
      toAssignment({ ...row, machineId: down.d.machineId }),
      window,
      false,
    ),
  );
  const correctlyKept = onDownMachine.filter(
    (row) => new Date(row.item.plannedStart).getTime() >= window.endAt.getTime(),
  );

  console.log(`=== ${down.m.code} gedimas ${down.d.startAt} → ${down.d.endAt} ===\n`);
  console.log(`Darbų ant ${down.m.code} plane: ${onDownMachine.length}`);
  console.log(`Teisingai palikta (pradžia po remonto): ${correctlyKept.length}`);
  console.log(`Turėjo būti perkelta, bet vis dar ant ${down.m.code}: ${shouldHaveMoved.length}`);

  if (shouldHaveMoved.length > 0) {
    console.log("\n⚠ Nepavyko perkelti:");
    for (const row of shouldHaveMoved) {
      console.log(
        `  ${row.proposalNumber} ${row.item.widthMm} mm — ${row.item.plannedStart}`,
      );
    }
  } else {
    console.log("\n✓ Visi gedimo lango darbai perkelti arba jų nebuvo.");
  }

  const otherMachines = rows.filter((row) => row.machine.id !== down.d.machineId);
  const earlyStarts = otherMachines.filter(
    (row) => new Date(row.item.plannedStart).getTime() < window.endAt.getTime(),
  );
  const byMachine = new Map<string, number>();
  for (const row of earlyStarts) {
    byMachine.set(row.machine.code, (byMachine.get(row.machine.code) ?? 0) + 1);
  }
  console.log(`\nKitose staklėse su pradžia < remonto pabaiga: ${earlyStarts.length}`);
  for (const [code, count] of [...byMachine.entries()].sort()) {
    console.log(`  ${code}: ${count} darb.`);
  }
}

main().catch(console.error);
