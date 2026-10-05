import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { eq, inArray } from "drizzle-orm";
import { db, initializeDatabase } from "../src/lib/db";
import {
  jobs,
  machines,
  proposalLines,
  proposals,
  queueOverrides,
  queuePlanItems,
  queuePlanRuns,
  tiles,
  users,
} from "../src/lib/db/schema";
import { confirmProposal, saveProposal } from "../src/lib/db/proposals";
import { syncQueueMachinesFromArchive } from "../src/lib/queue/archive-machines";
import {
  capSeedPieces,
  isShopWidth,
  MAX_ARCHIVE_LINES,
  pickDiverseArchiveOrders,
  pickSpreadWidths,
  remapArchiveDeadlines,
} from "../src/lib/queue/archive-queue-sample";
import { normalizeArchivePieces } from "../src/lib/queue/archive-quantities";
import { SHOP_MACHINE_ORDER } from "../src/lib/queue/constants";
import { lockedWeekForPlanner } from "../src/lib/queue/week";
import { defaultPackaging } from "../src/lib/types";

const EXTRACT_DIR = path.join(process.cwd(), "data", "archive-import");
const TARGET_ORDERS = 56;
const FORCE_RESEED = process.argv.includes("--force");

type WorkItem = {
  id: string;
  brick: string;
  quantity: number;
};

type ArchiveProposal = {
  number: string;
  client: string;
  object: string;
  deadline: string;
  lines: { tileId: string; widthMm: number; quantity: number }[];
};

function readCsv(filename: string): Record<string, string>[] {
  const filePath = path.join(EXTRACT_DIR, filename);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing ${filePath}`);
  }
  return parse(fs.readFileSync(filePath, "utf8"), {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  }) as Record<string, string>[];
}

function parseBubbleDate(value: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return "";
  }
  return new Date(parsed).toISOString().slice(0, 10);
}

function addDaysIso(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function loadArchiveProposals(
  tileByBubble: Map<
    string,
    { id: string; widthMm: number; quantityPerPallet: number }
  >,
  existingNumbers: Set<string>,
): ArchiveProposal[] {
  const workItems = new Map<string, WorkItem>();
  for (const row of readCsv(
    "export_All-Work-items-modified_2026-09-28_08-44-26.csv",
  )) {
    const id = row["unique id"]?.trim();
    const brick = row.brick?.trim();
    const quantity = Number.parseFloat(row.quantity ?? "");
    if (!id || !brick || !Number.isFinite(quantity) || quantity <= 0) continue;
    workItems.set(id, { id, brick, quantity });
  }

  const loaded: ArchiveProposal[] = [];
  for (const row of readCsv(
    "export_All-Proposals-modified--_2026-09-28_08-35-08.csv",
  )) {
    if (row.status?.trim() !== "Patvirtintas") continue;
    const number = (row.title || row.webID || "").trim();
    if (!number || existingNumbers.has(number)) continue;
    const workIds = (row.work_items ?? "")
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    const lines: ArchiveProposal["lines"] = [];
    for (const workId of workIds) {
      const item = workItems.get(workId);
      if (!item) continue;
      const tile = tileByBubble.get(item.brick);
      if (!tile || !isShopWidth(tile.widthMm)) continue;
      lines.push({
        tileId: tile.id,
        widthMm: tile.widthMm,
        quantity: capSeedPieces(
          normalizeArchivePieces(item.quantity, tile.quantityPerPallet),
        ),
      });
    }
    if (lines.length === 0 || lines.length > MAX_ARCHIVE_LINES) continue;
    loaded.push({
      number,
      client: row.client?.trim() || "Be kliento",
      object: row.site?.trim() || row.project?.trim() || "",
      deadline: parseBubbleDate(row.deadline || row.atlikimoTerminas),
      lines,
    });
  }
  return loaded;
}

async function applyMachineMagnets(widths: number[]): Promise<number[]> {
  const magnets = pickSpreadWidths(widths, SHOP_MACHINE_ORDER.length);
  const machineRows = await db.select().from(machines);
  const byCode = new Map(machineRows.map((row) => [row.code, row]));

  for (const [index, code] of SHOP_MACHINE_ORDER.entries()) {
    const machine = byCode.get(code);
    const widthMm = magnets[index];
    if (!machine || widthMm == null) continue;
    await db
      .update(machines)
      .set({ currentWidthMm: widthMm })
      .where(eq(machines.id, machine.id));
  }

  return magnets;
}

async function clearQueuePlans(): Promise<void> {
  await db.delete(queueOverrides);
  await db.delete(queuePlanItems);
  await db.delete(queuePlanRuns);
}

async function clearArchiveQueueSample(): Promise<number> {
  const sampleRows = await db
    .select({ id: proposals.id })
    .from(proposals)
    .where(
      inArray(proposals.comment, ["archive-queue-sample", "queue-stress-sample"]),
    );
  const ids = sampleRows.map((row) => row.id);
  if (ids.length === 0) {
    return 0;
  }
  await db.delete(jobs).where(inArray(jobs.proposalId, ids));
  await db.delete(proposalLines).where(inArray(proposalLines.proposalId, ids));
  await db.delete(proposals).where(inArray(proposals.id, ids));
  return ids.length;
}

async function confirmExistingOpen(): Promise<number> {
  const open = await db
    .select({ id: proposals.id })
    .from(proposals)
    .where(inArray(proposals.status, ["draft", "sent"]));
  let jobsCreated = 0;
  for (const row of open) {
    try {
      jobsCreated += await confirmProposal(row.id);
    } catch {
      // already confirmed or empty
    }
  }
  return jobsCreated;
}

async function main(): Promise<void> {
  initializeDatabase();
  const machinesSynced = await syncQueueMachinesFromArchive();
  const { importCuttingNorms } = await import("../src/lib/queue/excel-norms");
  const cutting = await importCuttingNorms();
  const confirmedOpenJobs = await confirmExistingOpen();

  const tileRows = await db
    .select({
      id: tiles.id,
      bubbleId: tiles.bubbleId,
      name: tiles.name,
      widthMm: tiles.widthMm,
      quantityPerPallet: tiles.quantityPerPallet,
    })
    .from(tiles);
  const tileByBubble = new Map<
    string,
    { id: string; widthMm: number; quantityPerPallet: number }
  >();
  for (const tile of tileRows) {
    if (tile.bubbleId) {
      tileByBubble.set(tile.bubbleId, {
        id: tile.id,
        widthMm: tile.widthMm,
        quantityPerPallet: tile.quantityPerPallet,
      });
    }
  }

  const existing = await db
    .select({ number: proposals.number, comment: proposals.comment })
    .from(proposals);
  const existingNumbers = new Set(existing.map((row) => row.number));
  const alreadySampled = existing.filter(
    (row) =>
      row.comment === "archive-queue-sample" ||
      row.comment === "queue-stress-sample",
  ).length;

  if (FORCE_RESEED && alreadySampled > 0) {
    await clearQueuePlans();
    const cleared = await clearArchiveQueueSample();
    existingNumbers.clear();
    const remaining = await db
      .select({ number: proposals.number })
      .from(proposals);
    for (const row of remaining) {
      existingNumbers.add(row.number);
    }
    console.log(JSON.stringify({ forceCleared: cleared }, null, 2));
  } else if (alreadySampled >= TARGET_ORDERS) {
    console.log(
      JSON.stringify(
        {
          skipped: true,
          reason: `already have ${alreadySampled} archive-queue-sample orders`,
          machines: machinesSynced,
          cutting,
        },
        null,
        2,
      ),
    );
    return;
  }

  const queuedNow = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(inArray(jobs.status, ["queued", "in_progress"]));

  const [creator] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, "danas@deisida.lt"))
    .limit(1);

  const candidates = loadArchiveProposals(tileByBubble, existingNumbers);
  const picked = pickDiverseArchiveOrders(candidates, TARGET_ORDERS);
  const week = lockedWeekForPlanner();
  const remappedDeadlines = remapArchiveDeadlines(
    picked.map((item) => item.deadline),
    week.startIso,
  );

  const magnetWidths = picked.flatMap((item) =>
    item.lines.map((line) => line.widthMm),
  );
  const magnets = await applyMachineMagnets(magnetWidths);

  if (picked.length < TARGET_ORDERS) {
    console.warn(
      `Only ${picked.length}/${TARGET_ORDERS} archive orders with shop widths 10–200 mm.`,
    );
  }

  let imported = 0;
  let jobsCreated = confirmedOpenJobs;
  for (const [index, item] of picked.entries()) {
    const deadline = remappedDeadlines[index] ?? addDaysIso(week.startIso, 10);
    let saved;
    try {
      saved = await saveProposal(
        {
          number: item.number,
          validUntil: addDaysIso(deadline, 14),
          serviceDeadline: deadline,
          client: item.client,
          object: item.object,
          address: "",
          comment: "archive-queue-sample",
          pjovimas: "",
          packaging: defaultPackaging(),
          tileLines: item.lines.map((line) => ({
            id: crypto.randomUUID(),
            tileId: line.tileId,
            quantity: line.quantity,
            quantityUnit: "pieces" as const,
          })),
          extraClauses: [],
        },
        {
          status: "sent",
          createdById: creator?.id,
        },
      );
    } catch (error) {
      throw new Error(
        `Failed to save proposal ${item.number} (index ${index}): ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
    try {
      jobsCreated += await confirmProposal(saved.id);
    } catch (error) {
      throw new Error(
        `Failed to confirm proposal ${item.number} (index ${index}): ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
    existingNumbers.add(item.number);
    imported += 1;
  }

  const queuedAfter = await db
    .select({ id: jobs.id, widthMm: jobs.widthMm, deadline: jobs.deadline })
    .from(jobs)
    .where(inArray(jobs.status, ["queued", "in_progress"]));

  const deadlines = queuedAfter.map((job) => job.deadline).sort();

  console.log(
    JSON.stringify(
      {
        machines: machinesSynced,
        cutting,
        magnets: Object.fromEntries(
          SHOP_MACHINE_ORDER.map((code, index) => [code, magnets[index]]),
        ),
        confirmedExistingJobs: confirmedOpenJobs,
        archiveOrdersImported: imported,
        jobsCreated,
        queuedBefore: queuedNow.length,
        queuedAfter: queuedAfter.length,
        deadlineRange:
          deadlines.length > 0
            ? { min: deadlines[0], max: deadlines[deadlines.length - 1] }
            : null,
        widthSpread: Object.fromEntries(
          [
            ...new Map(
              queuedAfter.reduce((map, job) => {
                map.set(job.widthMm, (map.get(job.widthMm) ?? 0) + 1);
                return map;
              }, new Map<number, number>()),
            ),
          ].sort((left, right) => left[0] - right[0]),
        ),
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
