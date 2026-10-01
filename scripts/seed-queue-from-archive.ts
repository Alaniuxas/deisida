import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { eq, inArray } from "drizzle-orm";
import { db, initializeDatabase } from "../src/lib/db";
import { jobs, proposals, tiles, users } from "../src/lib/db/schema";
import { confirmProposal, saveProposal } from "../src/lib/db/proposals";
import { syncQueueMachinesFromArchive } from "../src/lib/queue/archive-machines";
import { defaultPackaging } from "../src/lib/types";

const EXTRACT_DIR = path.join(process.cwd(), "data", "archive-import");
const TARGET_ORDERS = 30;

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
    return "2026-12-15";
  }
  return new Date(parsed).toISOString().slice(0, 10);
}

function addDaysIso(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function pickDiverse(
  candidates: ArchiveProposal[],
  limit: number,
): ArchiveProposal[] {
  const selected: ArchiveProposal[] = [];
  const used = new Set<string>();
  const seenWidths = new Set<number>();

  const score = (item: ArchiveProposal) =>
    item.lines.filter((line) => !seenWidths.has(line.widthMm)).length;

  while (selected.length < limit && used.size < candidates.length) {
    let best: ArchiveProposal | null = null;
    let bestScore = -1;
    for (const candidate of candidates) {
      if (used.has(candidate.number)) continue;
      const next = score(candidate);
      if (next > bestScore) {
        best = candidate;
        bestScore = next;
      }
    }
    if (!best) break;
    used.add(best.number);
    selected.push(best);
    for (const line of best.lines) seenWidths.add(line.widthMm);
  }

  return selected;
}

function loadArchiveProposals(
  tileByBubble: Map<string, { id: string; widthMm: number }>,
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
      if (!tile) continue;
      lines.push({
        tileId: tile.id,
        widthMm: tile.widthMm,
        quantity: item.quantity,
      });
    }
    if (lines.length === 0 || lines.length > 2) continue;
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
      widthMm: tiles.widthMm,
    })
    .from(tiles);
  const tileByBubble = new Map<string, { id: string; widthMm: number }>();
  for (const tile of tileRows) {
    if (tile.bubbleId) {
      tileByBubble.set(tile.bubbleId, { id: tile.id, widthMm: tile.widthMm });
    }
  }

  const existing = await db
    .select({ number: proposals.number, comment: proposals.comment })
    .from(proposals);
  const existingNumbers = new Set(existing.map((row) => row.number));
  const alreadySampled = existing.filter(
    (row) => row.comment === "archive-queue-sample",
  ).length;
  if (alreadySampled >= TARGET_ORDERS) {
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
  const picked = pickDiverse(candidates, TARGET_ORDERS);

  let imported = 0;
  let jobsCreated = confirmedOpenJobs;
  for (const item of picked) {
    const saved = await saveProposal(
      {
        number: item.number,
        validUntil: addDaysIso(item.deadline, 14),
        serviceDeadline: item.deadline,
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
    jobsCreated += await confirmProposal(saved.id);
    existingNumbers.add(item.number);
    imported += 1;
  }

  const queuedAfter = await db
    .select({ id: jobs.id, widthMm: jobs.widthMm })
    .from(jobs)
    .where(inArray(jobs.status, ["queued", "in_progress"]));

  console.log(
    JSON.stringify(
      {
        machines: machinesSynced,
        cutting,
        confirmedExistingJobs: confirmedOpenJobs,
        archiveOrdersImported: imported,
        jobsCreated,
        queuedBefore: queuedNow.length,
        queuedAfter: queuedAfter.length,
        widthSpread: Object.fromEntries(
          [...new Map(
            queuedAfter.reduce((map, job) => {
              map.set(job.widthMm, (map.get(job.widthMm) ?? 0) + 1);
              return map;
            }, new Map<number, number>()),
          )].sort((left, right) => left[0] - right[0]),
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
