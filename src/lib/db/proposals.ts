import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  proposals,
  proposalLines,
  jobs,
  tiles,
  type ProposalRow,
  type ProposalLineRow,
} from "@/lib/db/schema";
import type { PackagingOptions, Proposal, QuantityUnit, TileLine } from "@/lib/types";
import { defaultPackaging } from "@/lib/types";
import { getLinePieceCount } from "@/lib/proposal-utils";
import { tileRowToTile } from "@/lib/db/tiles";

export interface ProposalWithLines extends ProposalRow {
  lines: ProposalLineRow[];
}

function parsePackaging(json: string): PackagingOptions {
  try {
    return { ...defaultPackaging(), ...JSON.parse(json) };
  } catch {
    return defaultPackaging();
  }
}

export function proposalToForm(
  row: ProposalRow,
  lines: ProposalLineRow[],
): Proposal {
  return {
    number: row.number,
    validUntil: row.validUntil,
    serviceDeadline: row.serviceDeadline,
    client: row.clientName,
    object: row.object,
    address: row.address ?? "",
    comment: row.comment,
    pjovimas: row.pjovimas,
    packaging: parsePackaging(row.packagingJson),
    tileLines: lines.map((line) => ({
      id: line.id,
      tileId: line.tileId,
      quantity: line.quantity,
      quantityUnit: line.quantityUnit as QuantityUnit,
    })),
    extraClauses: [],
  };
}

export async function listProposals(): Promise<ProposalWithLines[]> {
  const proposalRows = await db
    .select()
    .from(proposals)
    .orderBy(desc(proposals.updatedAt));

  const result: ProposalWithLines[] = [];
  for (const row of proposalRows) {
    const lines = await db
      .select()
      .from(proposalLines)
      .where(eq(proposalLines.proposalId, row.id))
      .orderBy(asc(proposalLines.sortOrder));
    result.push({ ...row, lines });
  }
  return result;
}

export async function getProposalById(
  id: string,
): Promise<ProposalWithLines | null> {
  const [row] = await db
    .select()
    .from(proposals)
    .where(eq(proposals.id, id))
    .limit(1);
  if (!row) return null;

  const lines = await db
    .select()
    .from(proposalLines)
    .where(eq(proposalLines.proposalId, id))
    .orderBy(asc(proposalLines.sortOrder));

  return { ...row, lines };
}

export async function saveProposal(
  data: Proposal,
  options: {
    id?: string;
    status?: ProposalRow["status"];
    createdById?: string;
    clientId?: string | null;
  },
): Promise<ProposalWithLines> {
  const now = new Date().toISOString();
  const id = options.id ?? crypto.randomUUID();

  const payload = {
    number: data.number.trim(),
    status: options.status ?? "draft",
    validUntil: data.validUntil,
    serviceDeadline: data.serviceDeadline,
    clientId: options.clientId ?? null,
    clientName: data.client.trim(),
    object: data.object.trim(),
    address: data.address.trim(),
    comment: data.comment,
    pjovimas: data.pjovimas,
    packagingJson: JSON.stringify(data.packaging),
    createdById: options.createdById ?? null,
    updatedAt: now,
  };

  const existing = options.id
    ? await getProposalById(options.id)
    : await getProposalByNumber(data.number);

  if (existing) {
    await db
      .update(proposals)
      .set(payload)
      .where(eq(proposals.id, existing.id));
    await db
      .delete(proposalLines)
      .where(eq(proposalLines.proposalId, existing.id));
  } else {
    await db.insert(proposals).values({
      id,
      ...payload,
      createdAt: now,
    });
  }

  const proposalId = existing?.id ?? id;

  for (const [index, line] of data.tileLines.entries()) {
    await db.insert(proposalLines).values({
      id: line.id || crypto.randomUUID(),
      proposalId,
      tileId: line.tileId,
      quantity: line.quantity,
      quantityUnit: line.quantityUnit,
      sortOrder: index,
    });
  }

  const saved = await getProposalById(proposalId);
  if (!saved) throw new Error("Nepavyko išsaugoti pasiūlymo.");
  return saved;
}

async function getProposalByNumber(
  number: string,
): Promise<ProposalWithLines | null> {
  const [row] = await db
    .select()
    .from(proposals)
    .where(eq(proposals.number, number.trim()))
    .limit(1);
  if (!row) return null;
  return getProposalById(row.id);
}

export async function confirmProposal(proposalId: string): Promise<number> {
  const proposal = await getProposalById(proposalId);
  if (!proposal) throw new Error("Pasiūlymas nerastas.");
  if (proposal.status === "confirmed" || proposal.status === "in_production") {
    throw new Error("Pasiūlymas jau patvirtintas.");
  }

  const catalogTiles = await db.select().from(tiles);
  const tileMap = new Map(catalogTiles.map((tile) => [tile.id, tileRowToTile(tile)]));

  const existingJobs = await db
    .select({ proposalLineId: jobs.proposalLineId })
    .from(jobs)
    .where(eq(jobs.proposalId, proposalId));
  const existingLineIds = new Set(
    existingJobs.map((job) => job.proposalLineId),
  );

  let created = 0;
  for (const [index, line] of proposal.lines.entries()) {
    if (existingLineIds.has(line.id)) {
      continue;
    }

    const tile = tileMap.get(line.tileId);
    const tileLine: TileLine = {
      id: line.id,
      tileId: line.tileId,
      quantity: line.quantity,
      quantityUnit: line.quantityUnit as QuantityUnit,
    };

    const pieceCount = tile
      ? getLinePieceCountWithTile(tileLine, tile)
      : Math.round(line.quantity);

    await db.insert(jobs).values({
      id: crypto.randomUUID(),
      proposalId: proposal.id,
      proposalLineId: line.id,
      tileId: line.tileId,
      status: "queued",
      quantity: line.quantity,
      quantityUnit: line.quantityUnit,
      pieceCount,
      completedPieces: 0,
      deadline: proposal.serviceDeadline,
      machineId: null,
      widthMm: tile?.widthMm ?? 0,
      sortOrder: index,
      startedAt: null,
      finishedAt: null,
    });
    created += 1;
  }

  await db
    .update(proposals)
    .set({ status: "confirmed", updatedAt: new Date().toISOString() })
    .where(eq(proposals.id, proposalId));

  return created;
}

function getLinePieceCountWithTile(
  line: TileLine,
  tile: { quantityPerPallet: number },
): number {
  if (line.quantityUnit === "pieces") {
    return Math.round(line.quantity);
  }
  return Math.round(line.quantity * tile.quantityPerPallet);
}
