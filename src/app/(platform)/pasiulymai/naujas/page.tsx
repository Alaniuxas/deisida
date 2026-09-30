import { ProposalCreator } from "@/components/proposal-creator";
import { getAllTiles } from "@/lib/db/tiles";

export const dynamic = "force-dynamic";

function parseRequestedLines(value: string | undefined): number {
  const requestedLines = Number(value);
  if (!Number.isFinite(requestedLines)) return 1;
  return Math.min(Math.max(Math.trunc(requestedLines), 1), 10);
}

function parseSeedTileIds(
  params: Record<string, string | string[] | undefined>,
): string[] {
  const ids: string[] = [];
  for (let index = 0; index < 10; index += 1) {
    const raw = params[`lineTile-${index}`];
    const value = Array.isArray(raw) ? raw[0] : raw;
    ids[index] = typeof value === "string" ? value : "";
  }
  while (ids.length > 0 && !ids[ids.length - 1]) {
    ids.pop();
  }
  return ids;
}

export default async function NaujasPasiulymasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const catalog = await getAllTiles();
  const params = await searchParams;
  const linesParam = Array.isArray(params.lines) ? params.lines[0] : params.lines;
  const seedTileIds = parseSeedTileIds(params);
  const initialLineCount = Math.max(
    parseRequestedLines(linesParam),
    seedTileIds.length,
    1,
  );

  return (
    <ProposalCreator
      key={`naujas-${initialLineCount}-${seedTileIds.join(",")}`}
      catalog={catalog}
      initialLineCount={initialLineCount}
      seedTileIds={seedTileIds}
    />
  );
}
