import Link from "next/link";
import { listProposals } from "@/lib/db/proposals";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

const statusLabels: Record<string, string> = {
  draft: "Juodraštis",
  sent: "Išsiųstas",
  confirmed: "Patvirtintas",
  in_production: "Gamyba",
};

export default async function PasiulymaiPage() {
  const proposals = await listProposals();

  return (
    <div className="mx-auto max-w-5xl px-6 py-8 lg:px-10">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-deisida-muted">Pasiūlymai</h1>
          <p className="mt-1 text-muted-foreground">
            Išsaugoti pasiūlymai ir jų būsenos
          </p>
        </div>
        <Link
          href="/pasiulymai/naujas"
          className="inline-flex h-10 items-center rounded-md bg-deisida px-4 text-sm font-medium text-deisida-foreground hover:bg-deisida/90"
        >
          Naujas pasiūlymas
        </Link>
      </div>

      {proposals.length === 0 ? (
        <div className="rounded-xl border border-dashed border-stone-line px-6 py-12 text-center">
          <p className="text-lg font-medium">Pasiūlymų dar nėra</p>
          <p className="mt-2 text-muted-foreground">
            Sukurkite naują pasiūlymą ir išsaugokite juodraštį.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-stone-line bg-paper">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-stone-line bg-[#f3f3f0]">
              <tr>
                <th className="px-4 py-3 font-semibold">Numeris</th>
                <th className="px-4 py-3 font-semibold">Klientas</th>
                <th className="px-4 py-3 font-semibold">Objektas</th>
                <th className="px-4 py-3 font-semibold">Būsena</th>
                <th className="px-4 py-3 font-semibold">Atnaujinta</th>
              </tr>
            </thead>
            <tbody>
              {proposals.map((proposal) => (
                <tr key={proposal.id} className="border-b border-stone-line last:border-0">
                  <td className="px-4 py-3">
                    <Link
                      href={`/pasiulymai/${proposal.id}`}
                      className="font-medium text-deisida hover:underline"
                    >
                      {proposal.number}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{proposal.clientName}</td>
                  <td className="px-4 py-3">{proposal.object}</td>
                  <td className="px-4 py-3">
                    <Badge variant="secondary">
                      {statusLabels[proposal.status] ?? proposal.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(proposal.updatedAt).toLocaleString("lt-LT")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
