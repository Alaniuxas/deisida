import { TileCatalogScreen } from "@/components/tile-catalog-screen";
import { getAllDiscs } from "@/lib/db/discs";
import { getAllTiles } from "@/lib/db/tiles";

export const dynamic = "force-dynamic";

export default async function PlyteliuBarasPage() {
  const [catalog, discs] = await Promise.all([getAllTiles(), getAllDiscs()]);

  return <TileCatalogScreen tiles={catalog} discs={discs} />;
}
