import { ProposalCreator } from "@/components/proposal-creator";
import { getAllTiles } from "@/lib/db/tiles";

export const dynamic = "force-dynamic";

function firstString(
  value: string | string[] | undefined,
): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

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
    const value = firstString(params[`lineTile-${index}`]);
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
  const seedTileIds = parseSeedTileIds(params);
  const seedFields = {
    client: firstString(params.client) ?? "",
    object: firstString(params.object) ?? "",
    address: firstString(params.address) ?? "",
    number: firstString(params.number) ?? "",
    comment: firstString(params.comment) ?? "",
  };
  const initialLineCount = Math.max(
    parseRequestedLines(firstString(params.lines)),
    seedTileIds.length,
    1,
  );

  return (
    <ProposalCreator
      key={`naujas-${initialLineCount}-${seedTileIds.join(",")}-${seedFields.client}-${seedFields.object}`}
      catalog={catalog}
      initialLineCount={initialLineCount}
      seedTileIds={seedTileIds}
      seedFields={seedFields}
    />
  );
}
