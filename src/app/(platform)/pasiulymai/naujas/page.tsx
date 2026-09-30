import { ProposalCreator } from "@/components/proposal-creator";
import { getAllTiles } from "@/lib/db/tiles";

export const dynamic = "force-dynamic";

export default async function NaujasPasiulymasPage() {
  const catalog = await getAllTiles();

  return <ProposalCreator catalog={catalog} />;
}
