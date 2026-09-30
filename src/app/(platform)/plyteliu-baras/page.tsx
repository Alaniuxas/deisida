import Link from "next/link";
import { getAllTiles } from "@/lib/db/tiles";
import { formatCatalogPrice } from "@/lib/proposal-utils";

export const dynamic = "force-dynamic";

export default async function PlyteliuBarasPage() {
  const catalog = await getAllTiles();

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 lg:px-10">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-deisida-muted">Plytelių baras</h1>
          <p className="mt-1 text-muted-foreground">
            Kataloge {catalog.length} plytelių — pasirinkite naujam pasiūlymui
          </p>
        </div>
        <Link
          href="/pasiulymai/naujas"
          className="inline-flex h-10 items-center rounded-md bg-deisida px-4 text-sm font-medium text-deisida-foreground hover:bg-deisida/90"
        >
          Naujas pasiūlymas
        </Link>
      </div>

      <div className="overflow-hidden rounded-xl border border-stone-line bg-paper">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-stone-line bg-[#f3f3f0]">
            <tr>
              <th className="px-4 py-3 font-semibold">Plytelė</th>
              <th className="px-4 py-3 font-semibold">Tiekėjas</th>
              <th className="px-4 py-3 font-semibold">Matmenys</th>
              <th className="px-4 py-3 font-semibold">Storis</th>
              <th className="px-4 py-3 font-semibold text-right">Kaina</th>
            </tr>
          </thead>
          <tbody>
            {catalog.map((tile) => (
              <tr key={tile.id} className="border-b border-stone-line last:border-0">
                <td className="px-4 py-3 font-medium">{tile.name}</td>
                <td className="px-4 py-3 text-muted-foreground">{tile.supplier}</td>
                <td className="px-4 py-3 tabular-nums">
                  {tile.lengthMm}×{tile.widthMm} mm
                </td>
                <td className="px-4 py-3 tabular-nums">{tile.heightMm} mm</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {formatCatalogPrice(tile.priceEur)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
