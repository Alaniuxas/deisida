"use client";

import type { Proposal } from "@/lib/types";
import { L_CORNER_NOTE } from "@/lib/types";
import {
  describePackagingChoices,
  formatDimensions,
  formatLineStoris,
  formatLtDate,
  formatLineQuantity,
  formatProductionPackagingSummary,
  formatYesNo,
} from "@/lib/proposal-utils";
import { getTileById } from "@/lib/tiles";

interface ProductionProposalPreviewProps {
  proposal: Proposal;
  loading?: boolean;
  error?: string | null;
  compact?: boolean;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-3 border-b border-stone-line py-2 last:border-b-0">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </dt>
      <dd className="text-sm leading-snug">{value}</dd>
    </div>
  );
}

export function ProductionProposalPreview({
  proposal,
  loading = false,
  error = null,
  compact = false,
}: ProductionProposalPreviewProps) {
  if (loading) {
    return (
      <div className="paper-shadow rounded-lg bg-paper p-8 animate-pulse">
        <div className="mb-6 h-8 w-1/3 rounded bg-muted" />
        <div className="mb-4 h-24 rounded bg-muted" />
        <div className="h-40 rounded bg-muted" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="paper-shadow rounded-lg border border-destructive/30 bg-paper p-6">
        <p className="text-lg font-semibold text-destructive">Peržiūros klaida</p>
        <p className="mt-2 text-sm text-muted-foreground">{error}</p>
      </div>
    );
  }

  return (
    <article
      className={`paper-shadow w-full rounded-lg bg-paper text-ink ${
        compact ? "p-4 text-[10px]" : "p-6 text-sm xl:p-8"
      }`}
    >
      <header className="mb-6 border-b-2 border-deisida-muted pb-5">
        <p className="text-2xl font-bold tracking-tight text-deisida-muted">GAMYBA</p>
        <p className="mt-1 text-xs text-muted-foreground">Darbo lapas cechui</p>

        <dl className="mt-4 rounded-md border border-stone-line bg-[#f3f3f0] px-4 py-2">
          <DetailRow label="Užsakymo Nr." value={proposal.number} />
          <DetailRow label="Klientas" value={proposal.client || "—"} />
          <DetailRow label="Objektas" value={proposal.object || "—"} />
          <DetailRow label="Terminas" value={formatLtDate(proposal.serviceDeadline)} />
        </dl>
      </header>

      <section className="space-y-4">
        {proposal.tileLines.map((line, index) => {
          const tile = getTileById(line.tileId);
          return (
            <div
              key={line.id}
              className="overflow-hidden rounded-md border border-stone-line"
            >
              <div className="bg-deisida-muted px-4 py-2">
                <h3 className="text-sm font-bold text-white">Eilutė {index + 1}</h3>
              </div>
              <dl className="px-4 py-1">
                <DetailRow label="Plytelė" value={tile?.name ?? "—"} />
                <DetailRow
                  label="Matmenys"
                  value={
                    tile
                      ? formatDimensions(tile.lengthMm, tile.widthMm, tile.heightMm)
                      : "—"
                  }
                />
                <DetailRow label="Pjovimo storis" value={formatLineStoris(line)} />
                <DetailRow label="Kiekis" value={formatLineQuantity(line)} />
                <DetailRow label="Diskas" value={tile?.disc ?? "—"} />
              </dl>
            </div>
          );
        })}
      </section>

      <section className="mt-6 rounded-md border border-stone-line bg-[#f3f3f0] px-4 py-4">
        <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-deisida-muted">
          Baras ir pakavimas
        </h3>
        <dl className="space-y-2">
          <DetailRow label="Baras" value={proposal.pjovimas} />
          <DetailRow
            label="Pakavimas"
            value={formatProductionPackagingSummary(proposal.packaging)}
          />
          <DetailRow
            label="Likučiai"
            value={formatYesNo(proposal.packaging.needLeftovers)}
          />
        </dl>
        <ul className="mt-3 space-y-1 text-xs leading-relaxed text-muted-foreground">
          {describePackagingChoices(proposal.packaging).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <footer className="mt-6 border-t border-stone-line pt-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-deisida">
          L-kampų pastaba
        </p>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          {L_CORNER_NOTE}
        </p>
      </footer>
    </article>
  );
}
