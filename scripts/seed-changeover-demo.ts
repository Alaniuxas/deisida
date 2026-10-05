/**
 * Demo eilė su sąmoningai skirtingais pločiais — tikrina geltonus reguliavimo blokus.
 *
 *   npm run db:seed-changeover
 *   npm run db:seed-changeover -- --force
 *   npx tsx scripts/run-queue-plan.ts --as-of=2026-10-02T20:00:00+03:00
 *   npx tsx scripts/audit-changeovers.ts
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
import { lockedWeekForPlanner } from "../src/lib/queue/week";
import { defaultPackaging } from "../src/lib/types";

const DEMO_COMMENT = "changeover-demo";
const STRESS_COMMENT = "queue-stress-sample";
const FORCE = process.argv.includes("--force");

/** Visi artimi NK1 magnetui (65 mm) — ta pati staklė, >5 mm žingsniai = reguliavimas. */
const DEMO_WIDTHS_MM = [55, 65, 70, 81, 90];
const DEMO_PIECES = 550;

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

async function clearProposalsByComment(comment: string): Promise<number> {
  const rows = await db
    .select({ id: proposals.id })
    .from(proposals)
    .where(eq(proposals.comment, comment));
  const ids = rows.map((row) => row.id);
  if (ids.length === 0) return 0;

  await db.delete(jobs).where(inArray(jobs.proposalId, ids));
  await db.delete(proposalLines).where(inArray(proposalLines.proposalId, ids));
  await db.delete(proposals).where(inArray(proposals.id, ids));
  return ids.length;
}

async function clearDemoData(): Promise<{ cov: number; stress: number }> {
  const cov = await clearProposalsByComment(DEMO_COMMENT);
  const stress = FORCE ? await clearProposalsByComment(STRESS_COMMENT) : 0;
  if (FORCE) {
    await db.delete(queueOverrides);
    await db.delete(queuePlanItems);
    await db.delete(queuePlanRuns);
  }
  return { cov, stress };
}

async function main(): Promise<void> {
  initializeDatabase();
  const asOf = parseAsOfArg();
  const week = lockedWeekForPlanner(asOf);

  if (FORCE) {
    const cleared = await clearDemoData();
    console.log(JSON.stringify({ forceCleared: cleared }, null, 2));
  }

  const existing = await db
    .select({ id: proposals.id })
    .from(proposals)
    .where(eq(proposals.comment, DEMO_COMMENT));
  if (!FORCE && existing.length >= DEMO_WIDTHS_MM.length) {
    console.log(
      JSON.stringify(
        {
          skipped: true,
          reason: `already have ${existing.length} changeover-demo proposals`,
          next: "npm run db:seed-changeover -- --force && npm run queue:plan",
        },
        null,
        2,
      ),
    );
    return;
  }

  const tileRows = await db
    .select({ id: tiles.id, widthMm: tiles.widthMm })
    .from(tiles);
  const tileByWidth = new Map<number, string>();
  for (const tile of tileRows) {
    if (!tileByWidth.has(tile.widthMm)) {
      tileByWidth.set(tile.widthMm, tile.id);
    }
  }

  const missingWidths = DEMO_WIDTHS_MM.filter((width) => !tileByWidth.has(width));
  if (missingWidths.length > 0) {
    throw new Error(
      `Trūksta plytelių plotiams: ${missingWidths.join(", ")} — paleiskite db:import.`,
    );
  }

  const [creator] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, "danas@deisida.lt"))
    .limit(1);

  let imported = 0;
  let jobsCreated = 0;
  const deadline = week.startIso;

  for (const [index, widthMm] of DEMO_WIDTHS_MM.entries()) {
    const tileId = tileByWidth.get(widthMm);
    if (!tileId) continue;

    const number = `COV-${week.startIso.replace(/-/g, "")}-${index + 1}`;

    const saved = await saveProposal(
      {
        number,
        validUntil: addDaysIso(deadline, 14),
        serviceDeadline: deadline,
        client: `Reguliavimo demo ${index + 1}`,
        object: `Plotis ${widthMm} mm (reguliavimo testas)`,
        address: "",
        comment: DEMO_COMMENT,
        pjovimas: "",
        packaging: defaultPackaging(),
        tileLines: [
          {
            id: crypto.randomUUID(),
            tileId,
            quantity: DEMO_PIECES,
            quantityUnit: "pieces",
          },
        ],
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

  console.log(
    JSON.stringify(
      {
        imported,
        jobsCreated,
        widthsMm: DEMO_WIDTHS_MM,
        piecesEach: DEMO_PIECES,
        lockedWeek: week,
        note: "Staklių magnetai nekeičiami — naudokite esamus admin nustatymus.",
        next: [
          "npx tsx scripts/run-queue-plan.ts --as-of=2026-10-02T20:00:00+03:00",
          "npx tsx scripts/audit-changeovers.ts",
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
