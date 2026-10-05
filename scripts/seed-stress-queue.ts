/**
 * Stress testas iš tikrų DB pasiūlymų (DEI-* / archive-queue-sample):
 * tie patys plotiai ir kiekiai, tik terminai perkeliami į užrakintą savaitę.
 * Staklių magnetų nekeičia.
 *
 *   npm run db:seed-stress
 *   npm run db:seed-stress -- --force
 *   npm run db:seed-stress -- --force --as-of=2026-10-02T20:00:00+03:00
 */
import { eq, inArray } from "drizzle-orm";
import { db, initializeDatabase } from "../src/lib/db";
import {
  jobs,
  proposalLines,
  proposals,
  queueOverrides,
  queuePlanItems,
  queuePlanRuns,
  tiles,
  users,
} from "../src/lib/db/schema";
import { confirmProposal, saveProposal } from "../src/lib/db/proposals";
import {
  pickDiverseArchiveOrders,
  remapArchiveDeadlines,
  type WidthedOrder,
} from "../src/lib/queue/archive-queue-sample";
import { importCuttingNorms } from "../src/lib/queue/excel-norms";
import { lockedWeekForPlanner } from "../src/lib/queue/week";
import { defaultPackaging } from "../src/lib/types";

const SOURCE_COMMENT = "archive-queue-sample";
const STRESS_COMMENT = "queue-stress-sample";
const FORCE = process.argv.includes("--force");
const TARGET_PROPOSALS = 45;
const MIN_TOTAL_PIECES = 400;

interface DbSourceProposal extends WidthedOrder {
  id: string;
  client: string;
  object: string;
  totalPieces: number;
  lines: {
    tileId: string;
    widthMm: number;
    quantity: number;
    quantityUnit: "pieces" | "pallets";
    storisMm: number;
  }[];
}

function parseAsOfArg(): Date {
  const flag = process.argv.find((arg) => arg.startsWith("--as-of="));
  if (!flag) return new Date();
  const parsed = new Date(flag.slice("--as-of=".length));
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid --as-of: ${flag}`);
  }
  return parsed;
}

function addDaysIso(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function clearStressData(): Promise<number> {
  const rows = await db
    .select({ id: proposals.id })
    .from(proposals)
    .where(eq(proposals.comment, STRESS_COMMENT));
  const ids = rows.map((row) => row.id);
  if (ids.length === 0) return 0;

  await db.delete(jobs).where(inArray(jobs.proposalId, ids));
  await db.delete(proposalLines).where(inArray(proposalLines.proposalId, ids));
  await db.delete(proposals).where(inArray(proposals.id, ids));
  await db.delete(queueOverrides);
  await db.delete(queuePlanItems);
  await db.delete(queuePlanRuns);
  return ids.length;
}

async function loadSourceProposals(): Promise<DbSourceProposal[]> {
  const proposalRows = await db
    .select()
    .from(proposals)
    .where(eq(proposals.comment, SOURCE_COMMENT));

  if (proposalRows.length === 0) {
    throw new Error(
      `Nėra ${SOURCE_COMMENT} pasiūlymų — paleiskite npm run db:seed-queue.`,
    );
  }

  const lineRows = await db.select().from(proposalLines);
  const tileRows = await db
    .select({ id: tiles.id, widthMm: tiles.widthMm })
    .from(tiles);
  const widthByTile = new Map(tileRows.map((tile) => [tile.id, tile.widthMm]));
  const linesByProposal = new Map<string, typeof lineRows>();
  for (const line of lineRows) {
    const bucket = linesByProposal.get(line.proposalId) ?? [];
    bucket.push(line);
    linesByProposal.set(line.proposalId, bucket);
  }

  const loaded: DbSourceProposal[] = [];
  for (const proposal of proposalRows) {
    const rawLines = (linesByProposal.get(proposal.id) ?? []).sort(
      (left, right) => left.sortOrder - right.sortOrder,
    );
    if (rawLines.length === 0) continue;

    const lines = rawLines.map((line) => ({
      tileId: line.tileId,
      widthMm: widthByTile.get(line.tileId) ?? 0,
      quantity: line.quantity,
      quantityUnit: line.quantityUnit as "pieces" | "pallets",
      storisMm: line.storisMm,
    }));

    const totalPieces = lines.reduce(
      (sum, line) =>
        sum + (line.quantityUnit === "pieces" ? Math.round(line.quantity) : line.quantity),
      0,
    );

    loaded.push({
      id: proposal.id,
      number: proposal.number,
      client: proposal.clientName,
      object: proposal.object,
      deadline: proposal.serviceDeadline,
      totalPieces,
      lines,
    });
  }

  return loaded
    .filter((item) => item.totalPieces >= MIN_TOTAL_PIECES)
    .sort((left, right) => right.totalPieces - left.totalPieces);
}

function pickStressSources(candidates: DbSourceProposal[]): DbSourceProposal[] {
  const diverse = pickDiverseArchiveOrders(candidates, TARGET_PROPOSALS);
  if (diverse.length >= TARGET_PROPOSALS) {
    return diverse;
  }

  const used = new Set(diverse.map((item) => item.number));
  const rest = candidates.filter((item) => !used.has(item.number));
  return [...diverse, ...rest].slice(0, TARGET_PROPOSALS);
}

function remapStressDeadlines(
  sources: DbSourceProposal[],
  weekStartIso: string,
): string[] {
  return remapArchiveDeadlines(
    sources.map((item) => item.deadline),
    weekStartIso,
    { windowStartDays: 0, windowLengthDays: 4 },
  );
}

async function main(): Promise<void> {
  initializeDatabase();
  const asOf = parseAsOfArg();
  const week = lockedWeekForPlanner(asOf);
  const cutting = await importCuttingNorms();

  if (FORCE) {
    const cleared = await clearStressData();
    console.log(JSON.stringify({ forceCleared: cleared }, null, 2));
  }

  const existing = await db
    .select({ id: proposals.id })
    .from(proposals)
    .where(eq(proposals.comment, STRESS_COMMENT));
  if (!FORCE && existing.length >= TARGET_PROPOSALS) {
    console.log(
      JSON.stringify(
        {
          skipped: true,
          reason: `already have ${existing.length} stress proposals`,
          next: "npm run db:seed-stress -- --force && npm run queue:plan",
        },
        null,
        2,
      ),
    );
    return;
  }

  const candidates = await loadSourceProposals();
  const picked = pickStressSources(candidates);
  if (picked.length === 0) {
    throw new Error("Nepavyko parinkti stress pasiūlymų iš DB.");
  }

  const remappedDeadlines = remapStressDeadlines(picked, week.startIso);

  const [creator] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, "danas@deisida.lt"))
    .limit(1);

  const weekTag = week.startIso.replace(/-/g, "");
  let imported = 0;
  let jobsCreated = 0;

  for (const [index, source] of picked.entries()) {
    const deadline = remappedDeadlines[index] ?? week.startIso;
    const number = `STRESS-${weekTag}-${source.number}`;

    const saved = await saveProposal(
      {
        number,
        validUntil: addDaysIso(deadline, 21),
        serviceDeadline: deadline,
        client: source.client,
        object: source.object,
        address: "",
        comment: STRESS_COMMENT,
        pjovimas: "",
        packaging: defaultPackaging(),
        tileLines: source.lines.map((line) => ({
          id: crypto.randomUUID(),
          tileId: line.tileId,
          quantity: line.quantity,
          quantityUnit: line.quantityUnit,
          storisMm: line.storisMm > 0 ? line.storisMm : undefined,
        })),
        extraClauses: [],
      },
      {
        status: "sent",
        createdById: creator?.id,
      },
    );

    jobsCreated += await confirmProposal(saved.id);
    imported += 1;
  }

  const widthSpread = picked.reduce<Record<number, number>>((map, item) => {
    for (const line of item.lines) {
      map[line.widthMm] = (map[line.widthMm] ?? 0) + 1;
    }
    return map;
  }, {});

  console.log(
    JSON.stringify(
      {
        source: SOURCE_COMMENT,
        imported,
        jobsCreated,
        lockedWeek: week,
        totalPieces: picked.reduce((sum, item) => sum + item.totalPieces, 0),
        widthSpread,
        sampleSources: picked.slice(0, 5).map((item) => ({
          from: item.number,
          pieces: item.totalPieces,
          widths: [...new Set(item.lines.map((line) => line.widthMm))].sort(
            (a, b) => a - b,
          ),
        })),
        note: "Tik terminai pakeisti; plotiai/kiekiai kaip DB. Magnetai nekeičiami.",
        cutting,
        next: [
          "npx tsx scripts/run-queue-plan.ts --as-of=2026-10-02T20:00:00+03:00",
          "npx tsx scripts/audit-changeovers.ts",
          "npx tsx scripts/audit-queue.ts",
        ],
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
