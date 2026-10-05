import { inArray } from "drizzle-orm";
import { db, initializeDatabase } from "../src/lib/db";
import { jobs, machines } from "../src/lib/db/schema";
import { pickSpreadWidths } from "../src/lib/queue/archive-queue-sample";
import { SHOP_MACHINE_ORDER } from "../src/lib/queue/constants";

function parseSeedArg(): number {
  const flag = process.argv.find((arg) => arg.startsWith("--seed="));
  if (flag) {
    const value = Number(flag.split("=")[1]);
    if (Number.isFinite(value)) return value;
  }
  return 42;
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

async function loadJobWidths(): Promise<number[]> {
  const rows = await db
    .select({ widthMm: jobs.widthMm })
    .from(jobs)
    .where(inArray(jobs.status, ["queued", "in_progress"]));
  return rows.map((row) => row.widthMm);
}

async function main(): Promise<void> {
  await initializeDatabase();

  const seed = parseSeedArg();
  const random = mulberry32(seed);
  const spread = pickSpreadWidths(await loadJobWidths(), SHOP_MACHINE_ORDER.length);
  const shuffled = shuffle(spread, random);

  const machineRows = await db.select().from(machines);
  const byCode = new Map(machineRows.map((row) => [row.code, row]));

  console.log(`Seed: ${seed}`);
  console.log(`Išskirstyti plotiai iš eilės: ${spread.join(", ")} mm\n`);

  for (const [index, code] of SHOP_MACHINE_ORDER.entries()) {
    const machine = byCode.get(code);
    if (!machine) {
      console.warn(`⚠ ${code} nerasta DB — praleidžiama`);
      continue;
    }

    const widthMm = shuffled[index] ?? spread[index];
    if (widthMm == null) continue;
    await db
      .update(machines)
      .set({ currentWidthMm: widthMm })
      .where(inArray(machines.id, [machine.id]));

    console.log(`${code}: ${widthMm} mm (buvo ${machine.currentWidthMm ?? "nereguliuota"})`);
  }

  console.log("\nPaleiskite: npm run queue:plan — tada /eile (F5)");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
