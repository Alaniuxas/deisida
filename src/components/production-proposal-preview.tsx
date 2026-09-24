"use client";

import type { Proposal } from "@/lib/types";
import { L_CORNER_NOTE } from "@/lib/types";
import {
  describeProductionLine,
  formatLtDate,
  formatPieceQuantity,
} from "@/lib/proposal-utils";
import { getTileById } from "@/lib/tiles";

interface ProductionProposalPreviewProps {
  proposal: Proposal;
  loading?: boolean;
  error?: string | null;
  compact?: boolean;
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
      className={`paper-shadow mx-auto w-full rounded-lg bg-paper text-ink ${
        compact ? "p-4 text-[10px]" : "max-w-[210mm] p-8 text-sm"
      }`}
    >
      <header className="mb-6 flex flex-col gap-4 border-b-2 border-deisida-muted pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xl font-bold tracking-tight text-deisida-muted">
            GAMYBOS UŽDUOTIS
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            DEISIDA · cechui ir gamybos eilei
          </p>
        </div>
        <dl className="grid gap-1 text-xs sm:text-right">
          <div className="flex gap-2 sm:justify-end">
            <dt className="text-muted-foreground">Užsakymo Nr.</dt>
            <dd className="font-semibold">{proposal.number}</dd>
          </div>
          <div className="flex gap-2 sm:justify-end">
            <dt className="text-muted-foreground">Terminas</dt>
            <dd>{formatLtDate(proposal.serviceDeadline)}</dd>
          </div>
          <div className="flex gap-2 sm:justify-end">
            <dt className="text-muted-foreground">Klientas / objektas</dt>
            <dd>
              {proposal.client || "—"} · {proposal.object || "—"}
            </dd>
          </div>
        </dl>
      </header>

      <section className="space-y-5">
        {proposal.tileLines.map((line, index) => {
          const tile = getTileById(line.tileId);
          return (
            <div
              key={line.id}
              className="rounded-md border border-stone-line bg-[#f3f3f0] p-4"
            >
              <h3 className="mb-3 text-sm font-bold text-deisida-muted">
                Eilutė {index + 1}
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                    Plytelė
                  </p>
                  <p className="font-medium">{tile?.name ?? "—"}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                    Baras / pjūvis
                  </p>
                  <p className="font-medium">{line.pjovimas}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                    Pjovimo storis
                  </p>
                  <p>{line.showStoris ? `${line.storisMm} mm` : "—"}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                    Kiekis
                  </p>
                  <p className="font-medium tabular-nums">{formatPieceQuantity(line)}</p>
                </div>
                {tile?.disc ? (
                  <div className="sm:col-span-2">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                      Diskas
                    </p>
                    <p>{tile.disc}</p>
                  </div>
                ) : null}
              </div>

              <div className="mt-4 border-t border-stone-line pt-3">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  Pakavimas ir operacijos
                </p>
                <ul className="space-y-1 text-xs leading-relaxed">
                  {describeProductionLine(line, index)
                    .slice(4)
                    .map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                </ul>
              </div>

              {line.comment.trim() ? (
                <div className="mt-3 rounded border border-deisida/20 bg-white px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-deisida">
                    Gamybos komentaras
                  </p>
                  <p className="mt-1 text-xs">{line.comment.trim()}</p>
                </div>
              ) : null}
            </div>
          );
        })}
      </section>

      {proposal.comment ? (
        <section className="mt-5 rounded-md border border-stone-line px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-deisida-muted">
            Bendras gamybos komentaras
          </p>
          <p className="mt-2 text-xs leading-relaxed">{proposal.comment}</p>
        </section>
      ) : null}

      <footer className="mt-6 border-t border-stone-line pt-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-deisida">
          L-kampų pastaba
        </p>
        <p className="mt-2 text-xs leading-relaxed">{L_CORNER_NOTE}</p>
      </footer>
    </article>
  );
}
