"use client";

import type { Proposal } from "@/lib/types";
import { L_CORNER_NOTE } from "@/lib/types";
import {
  describeClientPackaging,
  formatCatalogPrice,
  formatDimensions,
  formatLineStoris,
  formatLtDate,
  formatLineQuantity,
  getLineCatalogPrice,
  getLineSubtotal,
  getProposalPricing,
} from "@/lib/proposal-utils";
import { getTileById } from "@/lib/tiles";
import { proposalDocumentClass } from "@/lib/proposal-document-styles";

interface ClientProposalPreviewProps {
  proposal: Proposal;
  loading?: boolean;
  error?: string | null;
  compact?: boolean;
}

export function ClientProposalPreview({
  proposal,
  loading = false,
  error = null,
  compact = false,
}: ClientProposalPreviewProps) {
  const pricing = getProposalPricing(proposal);
  const clientPackaging = describeClientPackaging(proposal.packaging);

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
      className={`paper-shadow w-full rounded-lg bg-paper ${proposalDocumentClass} ${
        compact ? "p-4 text-[10px]" : "p-6 text-sm xl:p-8"
      }`}
    >
      <header className="mb-6 grid grid-cols-1 gap-4 border-b-2 border-deisida pb-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:gap-8">
        <div className="min-w-0">
          <p className="text-2xl font-bold tracking-tight text-deisida">DEISIDA</p>
          <p className="mt-1 text-xs text-muted-foreground">Pasiūlymas klientui</p>
        </div>
        <dl className="grid shrink-0 gap-1.5 text-xs sm:min-w-[240px] sm:text-right">
          <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 sm:grid-cols-[1fr_auto] sm:gap-x-4">
            <dt className="text-muted-foreground sm:text-right">Pasiūlymo Nr.</dt>
            <dd className="font-semibold sm:text-right">{proposal.number}</dd>
          </div>
          <div className="grid grid-cols-[auto_1fr] gap-x-3 sm:grid-cols-[1fr_auto] sm:gap-x-4">
            <dt className="text-muted-foreground sm:text-right">Galioja iki</dt>
            <dd className="sm:text-right">{formatLtDate(proposal.validUntil)}</dd>
          </div>
          <div className="grid grid-cols-[auto_1fr] gap-x-3 sm:grid-cols-[1fr_auto] sm:gap-x-4">
            <dt className="text-muted-foreground sm:text-right">Paslaugos terminas</dt>
            <dd className="sm:text-right">{formatLtDate(proposal.serviceDeadline)}</dd>
          </div>
        </dl>
      </header>

      <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-md border border-stone-line px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-deisida-muted">
            Klientas
          </p>
          <p className="mt-1 font-medium">{proposal.client || "—"}</p>
        </div>
        <div className="rounded-md border border-stone-line px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-deisida-muted">
            Objektas
          </p>
          <p className="mt-1 font-medium">{proposal.object || "—"}</p>
        </div>
        <div className="rounded-md border border-stone-line px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-deisida-muted">
            Adresas
          </p>
          <p className="mt-1 font-medium">{proposal.address || "—"}</p>
        </div>
      </section>

      <section className="mb-6">
        <h2 className="mb-3 text-base font-semibold text-deisida-muted">Pasiūlymas</h2>
        <div className="overflow-x-auto rounded-md border border-stone-line">
          <table className="min-w-[640px] w-full table-fixed border-collapse">
            <colgroup>
              <col className="w-[20%]" />
              <col className="w-[17%]" />
              <col className="w-[13%]" />
              <col className="w-[12%]" />
              <col className="w-[18%]" />
              <col className="w-[20%]" />
            </colgroup>
            <thead>
              <tr className="border-b border-stone-line bg-[#f3f3f0] text-left text-[11px] text-muted-foreground">
                <th className="px-3 py-2.5 font-semibold leading-tight">Plytelė</th>
                <th className="px-3 py-2.5 font-semibold leading-tight">Matmenys</th>
                <th className="whitespace-normal px-3 py-2.5 font-semibold leading-tight">
                  Pjovimo storis
                </th>
                <th className="px-3 py-2.5 text-right font-semibold leading-tight">Kiekis</th>
                <th className="whitespace-normal px-3 py-2.5 text-right font-semibold leading-tight">
                  Kaina už vnt.
                </th>
                <th className="px-3 py-2.5 text-right font-semibold leading-tight">Suma</th>
              </tr>
            </thead>
            <tbody>
              {proposal.tileLines.map((line) => {
                const tile = getTileById(line.tileId);
                return (
                  <tr key={line.id} className="border-b border-stone-line last:border-0">
                    <td className="break-words px-3 py-3 align-middle font-medium">
                      {tile?.name ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 align-middle text-xs">
                      {tile
                        ? formatDimensions(tile.lengthMm, tile.widthMm, tile.heightMm)
                        : "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 align-middle tabular-nums">
                      {formatLineStoris(line)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right align-middle tabular-nums">
                      {formatLineQuantity(line)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right align-middle tabular-nums">
                      {formatCatalogPrice(getLineCatalogPrice(line))}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right align-middle font-medium tabular-nums">
                      {formatCatalogPrice(getLineSubtotal(line))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {clientPackaging.length > 0 ? (
        <section className="mb-6 rounded-md border border-stone-line bg-[#f3f3f0] px-4 py-4">
          <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-deisida-muted">
            Pakavimas
          </h3>
          <ul className="space-y-1.5 text-xs leading-relaxed">
            {clientPackaging.map((item) => (
              <li key={item} className="break-words">
                {item}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mb-6 flex justify-end">
        <dl className="min-w-[220px] space-y-1 text-sm">
          <div className="flex justify-between gap-6">
            <dt className="text-muted-foreground">Suma be PVM</dt>
            <dd className="tabular-nums">{formatCatalogPrice(pricing.subtotal)}</dd>
          </div>
          <div className="flex justify-between gap-6">
            <dt className="text-muted-foreground">PVM (21 %)</dt>
            <dd className="tabular-nums">{formatCatalogPrice(pricing.vat)}</dd>
          </div>
          <div className="flex justify-between gap-6 border-t border-stone-line pt-2 font-semibold">
            <dt>Suma su PVM</dt>
            <dd className="tabular-nums text-deisida">
              {formatCatalogPrice(pricing.total)}
            </dd>
          </div>
        </dl>
      </section>

      {(proposal.comment || proposal.extraClauses.length > 0) && (
        <section className="mb-4 rounded-md border border-stone-line bg-[#f3f3f0] px-4 py-4">
          <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-deisida-muted">
            Komentarai
          </h3>
          <div className="space-y-3 text-xs leading-relaxed">
            {proposal.comment ? (
              <p>
                <span className="font-semibold">Bendras komentaras: </span>
                {proposal.comment}
              </p>
            ) : null}
            {proposal.extraClauses.map((clause, index) => (
              <p key={`${clause}-${index}`}>
                <span className="font-semibold">Papildoma sąlyga: </span>
                {clause}
              </p>
            ))}
          </div>
        </section>
      )}

      <footer className="mt-6 border-t border-stone-line pt-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-deisida">
          Pastaba
        </p>
        <p className="mt-2 break-words text-xs leading-relaxed">{L_CORNER_NOTE}</p>
      </footer>
    </article>
  );
}
