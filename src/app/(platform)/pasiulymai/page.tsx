import Link from "next/link";
import { listProposalsPage } from "@/lib/db/proposals";
import { ProposalsList } from "@/components/proposals-list";

export default async function PasiulymaiPage() {
  const initial = await listProposalsPage({ limit: 20, offset: 0 });
  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 lg:px-10">
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

      <ProposalsList
        initialItems={initial.items}
        initialHasMore={initial.hasMore}
      />
    </div>
  );
}
