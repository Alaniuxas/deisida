"use client";

import type { Proposal } from "@/lib/types";
import { L_CORNER_NOTE } from "@/lib/types";
import {
  formatCatalogPrice,
  formatDimensions,
  formatLtDate,
  formatPieceQuantity,
  getLineSubtotal,
  getLineUnitPrice,
  getProposalPricing,
} from "@/lib/proposal-utils";
import { getTileById } from "@/lib/tiles";

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
      className={`paper-shadow mx-auto w-full rounded-lg bg-paper text-ink ${
        compact ? "p-4 text-[10px]" : "max-w-[210mm] p-8 text-sm"
      }`}
    >
      <header className="mb-6 flex flex-col gap-4 border-b-2 border-deisida pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-2xl font-bold tracking-tight text-deisida">DEISIDA</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Komercinis pasiūlymas klientui
          </p>
        </div>
        <dl className="grid gap-1 text-xs sm:text-right">
          <div className="flex gap-2 sm:justify-end">
            <dt className="text-muted-foreground">Pasiūlymo Nr.</dt>
            <dd className="font-semibold">{proposal.number}</dd>
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
      </section>

      <section className="mb-6">
        <h2 className="mb-3 text-base font-semibold text-deisida-muted">Pasiūlymas</h2>
        <div className="overflow-x-auto rounded-md border border-stone-line">
          <table className="min-w-full border-collapse">
            <thead>
              <tr className="border-b border-stone-line bg-[#f3f3f0] text-left text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                <th className="px-3 py-2.5 font-semibold">Plytelė</th>
                <th className="px-3 py-2.5 font-semibold">Baras</th>
                <th className="px-3 py-2.5 font-semibold">Matmenys</th>
                <th className="px-3 py-2.5 font-semibold">Pjovimo storis</th>
                <th className="px-3 py-2.5 font-semibold text-right">Kiekis</th>
                <th className="px-3 py-2.5 font-semibold text-right">Vnt. kaina</th>
                <th className="px-3 py-2.5 font-semibold text-right">Suma</th>
              </tr>
            </thead>
            <tbody>
              {proposal.tileLines.map((line) => {
                const tile = getTileById(line.tileId);
                return (
                  <tr key={line.id} className="border-b border-stone-line last:border-0">
                    <td className="px-3 py-2.5 align-top font-medium">
                      {tile?.name ?? "—"}
                    </td>
                    <td className="px-3 py-2.5 align-top">{line.pjovimas}</td>
                    <td className="px-3 py-2.5 align-top text-xs">
                      {tile
                        ? formatDimensions(tile.lengthMm, tile.widthMm, tile.heightMm)
                        : "—"}
                    </td>
                    <td className="px-3 py-2.5 align-top tabular-nums">
                      {line.showStoris ? `${line.storisMm} mm` : "—"}
                    </td>
                    <td className="px-3 py-2.5 align-top text-right text-xs tabular-nums">
                      {formatPieceQuantity(line)}
                    </td>
                    <td className="px-3 py-2.5 align-top text-right tabular-nums">
                      {formatCatalogPrice(getLineUnitPrice(line))}
                    </td>
                    <td className="px-3 py-2.5 align-top text-right font-medium tabular-nums">
                      {formatCatalogPrice(getLineSubtotal(line))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

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

      {(proposal.comment ||
        proposal.tileLines.some((line) => line.comment.trim()) ||
        proposal.extraClauses.length > 0) && (
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
            {proposal.tileLines.map((line, index) =>
              line.comment.trim() ? (
                <p key={line.id}>
                  <span className="font-semibold">Eilutė {index + 1}: </span>
                  {line.comment.trim()}
                </p>
              ) : null,
            )}
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
        <p className="mt-2 text-xs leading-relaxed">{L_CORNER_NOTE}</p>
      </footer>
    </article>
  );
}
