"use client";

import type { Proposal } from "@/lib/types";
import { L_CORNER_NOTE } from "@/lib/types";
import {
  describeLineSideInfo,
  formatCatalogPrice,
  formatLtDate,
  getLineCatalogPrice,
} from "@/lib/proposal-utils";
import { getTileById } from "@/lib/tiles";

interface ProposalPreviewProps {
  proposal: Proposal;
  loading?: boolean;
  error?: string | null;
  compact?: boolean;
}

export function ProposalPreview({
  proposal,
  loading = false,
  error = null,
  compact = false,
}: ProposalPreviewProps) {
  if (loading) {
    return (
      <div className="paper-shadow rounded-xl bg-paper p-8 animate-pulse">
        <div className="mb-6 h-8 w-1/3 rounded bg-muted" />
        <div className="mb-4 h-24 rounded bg-muted" />
        <div className="h-40 rounded bg-muted" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="paper-shadow rounded-xl border border-destructive/30 bg-paper p-6">
        <p className="font-serif text-lg text-destructive">Peržiūros klaida</p>
        <p className="mt-2 text-sm text-muted-foreground">{error}</p>
      </div>
    );
  }

  return (
    <article
      className={`paper-shadow mx-auto w-full rounded-xl bg-paper text-ink ${
        compact ? "p-4 text-[11px]" : "max-w-[210mm] p-8 text-sm"
      }`}
    >
      <header className="mb-6 flex flex-col gap-4 border-b border-stone-line pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-serif text-2xl font-semibold tracking-tight text-deisida">
            DEISIDA
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Plytelių pjovimo ir paruošimo paslaugos
          </p>
        </div>
        <dl className="grid gap-1 text-xs sm:text-right">
          <div className="flex gap-2 sm:justify-end">
            <dt className="text-muted-foreground">Pasiūlymo Nr.</dt>
            <dd className="font-medium">{proposal.number}</dd>
          </div>
          <div className="flex gap-2 sm:justify-end">
            <dt className="text-muted-foreground">Galioja iki</dt>
            <dd>{formatLtDate(proposal.validUntil)}</dd>
          </div>
          <div className="flex gap-2 sm:justify-end">
            <dt className="text-muted-foreground">Paslaugos terminas</dt>
            <dd>{formatLtDate(proposal.serviceDeadline)}</dd>
          </div>
        </dl>
      </header>

      <section className="mb-6 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-stone-line px-4 py-3">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Klientas
          </p>
          <p className="mt-1 font-medium">{proposal.client || "—"}</p>
        </div>
        <div className="rounded-lg border border-stone-line px-4 py-3">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Objektas
          </p>
          <p className="mt-1 font-medium">{proposal.object || "—"}</p>
        </div>
      </section>

      <section className="mb-6">
        <h2 className="mb-3 font-serif text-base font-semibold">Pasiūlymo eilutės</h2>
        <div className="overflow-x-auto rounded-lg border border-stone-line">
          <table className="min-w-full border-collapse">
            <thead>
              <tr className="border-b border-stone-line bg-[#f7f2ea] text-left text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                <th className="px-4 py-3 font-medium">Plytelė</th>
                <th className="px-4 py-3 font-medium">Pjūvis</th>
                <th className="px-4 py-3 font-medium text-right">Kiekis</th>
                <th className="px-4 py-3 font-medium text-right">Kaina</th>
              </tr>
            </thead>
            <tbody>
              {proposal.tileLines.map((line) => {
                const tile = getTileById(line.tileId);
                return (
                  <tr key={line.id} className="border-b border-stone-line last:border-0">
                    <td className="px-4 py-3 align-top font-medium">
                      {tile?.name ?? "—"}
                    </td>
                    <td className="px-4 py-3 align-top">{line.pjovimas}</td>
                    <td className="px-4 py-3 align-top text-right tabular-nums">
                      {line.quantityPallets} pal.
                    </td>
                    <td className="px-4 py-3 align-top text-right tabular-nums">
                      {formatCatalogPrice(getLineCatalogPrice(line))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {proposal.tileLines.length > 0 ? (
        <section className="mb-6 rounded-lg border border-dashed border-stone-line bg-[#faf7f2] px-4 py-4">
          <h3 className="mb-3 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Techninė ir operacinė informacija
          </h3>
          <div className="space-y-4">
            {proposal.tileLines.map((line, index) => (
              <div key={line.id} className="space-y-1 text-xs leading-relaxed">
                {describeLineSideInfo(line, index).map((item) => (
                  <p key={item}>{item}</p>
                ))}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {proposal.comment ? (
        <section className="mb-4">
          <h3 className="mb-2 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Komentaras
          </h3>
          <p className="rounded-lg border border-stone-line px-4 py-3 text-xs leading-relaxed">
            {proposal.comment}
          </p>
        </section>
      ) : null}

      {proposal.extraClauses.length > 0 ? (
        <section className="mb-4 space-y-2">
          <h3 className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Papildomos sąlygos
          </h3>
          {proposal.extraClauses.map((clause, index) => (
            <p
              key={`${clause}-${index}`}
              className="rounded-lg border border-stone-line px-4 py-3 text-xs leading-relaxed"
            >
              {clause}
            </p>
          ))}
        </section>
      ) : null}

      <footer className="mt-6 border-t border-stone-line pt-4">
        <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-deisida">
          Pastaba
        </p>
        <p className="mt-2 text-xs leading-relaxed">{L_CORNER_NOTE}</p>
      </footer>
    </article>
  );
}
