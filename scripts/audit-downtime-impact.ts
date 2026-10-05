import { desc, eq, like } from "drizzle-orm";
import { db } from "../src/lib/db";
import {
  jobs,
  machineDowntimes,
  machines,
  proposals,
  queueOverrides,
  queuePlanItems,
  queuePlanRuns,
} from "../src/lib/db/schema";
import { cutByIsoFromDate } from "../src/lib/queue/format";
import {
  buildDowntimeWindows,
  shouldMoveJobForDowntime,
} from "../src/lib/queue/downtime-redistribute";
import type { Assignment } from "../src/lib/queue/types";
import { lockedWeekFridayEnd } from "../src/lib/queue/week";

function isOnTime(deadline: string, plannedEnd: string): boolean {
  return new Date(plannedEnd).getTime() <= new Date(cutByIsoFromDate(deadline)).getTime();
}

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
  const [run] = await db
    .select()
    .from(queuePlanRuns)
    .orderBy(desc(queuePlanRuns.generatedAt))
    .limit(1);
  if (!run) return;

  const lockedWeek = { startIso: run.lockedWeekStart, endIso: run.lockedWeekEnd };
  const fridayEnd = lockedWeekFridayEnd(lockedWeek);

  const downtimes = await db
    .select({ d: machineDowntimes, m: machines })
    .from(machineDowntimes)
    .innerJoin(machines, eq(machineDowntimes.machineId, machines.id))
    .orderBy(desc(machineDowntimes.createdAt))
    .limit(1);

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

  const overrides = await db
    .select()
    .from(queueOverrides)
    .where(like(queueOverrides.reason, "%Gedimas%"))
    .orderBy(desc(queueOverrides.createdAt));

  console.log("=== 1. PERKELTI DARBAI (iš Gedimas įrašų) ===\n");
  if (overrides.length === 0) {
    console.log("Nėra išsaugotų perkėlimų (senas gedimas prieš žurnalą).");
    console.log("Simuliuojame: darbai, kurie DABAR turėjo būti perkelti nuo NK1.\n");
  } else {
    for (const row of overrides) {
      const job = rows.find((entry) => entry.job.id === row.jobId);
      if (!job) continue;
      const ok = isOnTime(job.job.deadline, job.item.plannedEnd);
      console.log(
        `${job.proposalNumber} · ${row.reason}`,
      );
      console.log(
        `  Buvo: ${row.fromStart?.slice(0, 16) ?? "—"} → Dabar: ${job.item.plannedEnd.slice(0, 16)} · Terminas ${job.job.deadline} · ${ok ? "✓ laiku" : "⚠ po termino"}`,
      );
    }
    console.log("");
  }

  if (downtimes.length > 0) {
    const down = downtimes[0];
    const window = buildDowntimeWindows([down.d]).get(down.d.machineId)!;

    const wouldMoveFromDown = rows.filter(
      (row) =>
        row.machine.id === down.d.machineId &&
        row.job.status === "queued" &&
        shouldMoveJobForDowntime(
          toAssignment({ ...row, machineId: down.d.machineId }),
          window,
          false,
        ),
    );

    console.log(`=== 2. LIKO ANT ${down.m.code} (turėjo būti perkelti, bet liko): ${wouldMoveFromDown.length} ===`);
    for (const row of wouldMoveFromDown) {
      const ok = isOnTime(row.job.deadline, row.item.plannedEnd);
      console.log(
        `  ${row.proposalNumber} pabaiga ${row.item.plannedEnd.slice(0, 16)} · terminas ${row.job.deadline} · ${ok ? "✓" : "⚠"}`,
      );
    }
    console.log("");
  }

  console.log("=== 3. PASTUMTI KITOSE STAKLĖSE (pradžia gedimo lange, ne ant sugedusios) ===\n");
  const downEnd = downtimes[0] ? new Date(downtimes[0].d.endAt) : null;
  const downMachineId = downtimes[0]?.d.machineId;

  const pushed = rows.filter((row) => {
    if (!downEnd || row.machine.id === downMachineId) return false;
    if (row.job.status !== "queued") return false;
    return new Date(row.item.plannedStart).getTime() < downEnd.getTime();
  });

  let pushedOk = 0;
  let pushedLate = 0;
  for (const row of pushed) {
    if (isOnTime(row.job.deadline, row.item.plannedEnd)) pushedOk += 1;
    else pushedLate += 1;
  }

  console.log(`Iš viso: ${pushed.length} darb.`);
  console.log(`  ✓ Laiku (pabaiga ≤ terminas): ${pushedOk}`);
  console.log(`  ⚠ Po termino: ${pushedLate}`);

  if (pushedLate > 0) {
    console.log("\nPo termino (pirmi 8):");
    for (const row of pushed.filter((entry) => !isOnTime(entry.job.deadline, entry.item.plannedEnd)).slice(0, 8)) {
      const daysLate = Math.ceil(
        (new Date(row.item.plannedEnd).getTime() - new Date(cutByIsoFromDate(row.job.deadline)).getTime()) /
          (24 * 60 * 60 * 1000),
      );
      console.log(
        `  ${row.proposalNumber} · ${row.machine.code} · terminas ${row.job.deadline} · pabaiga ${row.item.plannedEnd.slice(0, 16)} · ~${daysLate} d. vėluoja`,
      );
    }
  }

  console.log("\n=== 4. STAKLIŲ APKROVA (ar nepervažiavo savaitę) ===\n");
  const byMachine = new Map<string, { count: number; lastEnd: Date; afterFriday: number }>();
  for (const row of rows) {
    const code = row.machine.code;
    const bucket = byMachine.get(code) ?? { count: 0, lastEnd: new Date(0), afterFriday: 0 };
    bucket.count += 1;
    const end = new Date(row.item.plannedEnd);
    if (end > bucket.lastEnd) bucket.lastEnd = end;
    if (end > fridayEnd) bucket.afterFriday += 1;
    byMachine.set(code, bucket);
  }

  for (const [code, stats] of [...byMachine.entries()].sort()) {
    const overflow = stats.afterFriday > 0 ? ` ⚠ ${stats.afterFriday} darb. tęsiasi po pn 17:00` : "";
    console.log(
      `${code}: ${stats.count} darb., paskutinis ${stats.lastEnd.toISOString().slice(0, 16)}${overflow}`,
    );
  }

  console.log("\n=== SANTRAUKA ===");
  console.log(
    "Sistema NEGARANTUOJA termino po perkėlimo — tik perskaičiuoja laikus eilėje.",
  );
  console.log(
    `Pastumti gedimo metu: ${pushedOk}/${pushed.length} laiku, ${pushedLate} po termino.`,
  );
}

main().catch(console.error);
