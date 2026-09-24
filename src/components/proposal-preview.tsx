"use client";

import type { Proposal } from "@/lib/types";
import { L_CORNER_NOTE } from "@/lib/types";
import {
  describePackagingChoices,
  formatDimensions,
  formatLtDate,
} from "@/lib/proposal-utils";
import { getTileById } from "@/lib/tiles";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

interface ProposalPreviewProps {
  proposal: Proposal;
  loading?: boolean;
  error?: string | null;
}

export function ProposalPreview({
  proposal,
  loading = false,
  error = null,
}: ProposalPreviewProps) {
  if (loading) {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle className="text-base">Peržiūra</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 animate-pulse">
          <div className="h-6 w-1/3 rounded bg-muted" />
          <div className="h-32 rounded bg-muted" />
          <div className="h-24 rounded bg-muted" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="h-full border-destructive/40">
        <CardHeader>
          <CardTitle className="text-base text-destructive">Peržiūros klaida</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{error}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full overflow-hidden">
      <CardHeader className="border-b bg-muted/30 pb-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Peržiūra · A4
            </p>
            <CardTitle className="text-xl text-red-700">DEISIDA</CardTitle>
            <p className="text-xs text-muted-foreground">
              Plytelių pjovimo ir paruošimo paslaugos
            </p>
          </div>
          <div className="space-y-1 text-right text-xs">
            <p>
              <span className="text-muted-foreground">Nr. </span>
              <span className="font-semibold">{proposal.number}</span>
            </p>
            <p>
              <span className="text-muted-foreground">Galioja iki </span>
              {formatLtDate(proposal.validUntil)}
            </p>
            <p>
              <span className="text-muted-foreground">Terminas </span>
              {formatLtDate(proposal.serviceDeadline)}
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 overflow-auto p-4 text-sm">
        <div className="grid gap-2 rounded-md border text-xs md:grid-cols-2">
          <div className="border-b p-3 md:border-b-0 md:border-r">
            <p className="mb-1 text-muted-foreground">Klientas</p>
            <p className="font-medium">{proposal.client || "—"}</p>
          </div>
          <div className="p-3">
            <p className="mb-1 text-muted-foreground">Objektas</p>
            <p className="font-medium">{proposal.object || "—"}</p>
          </div>
        </div>

        <div className="overflow-x-auto rounded-md border">
          <table className="min-w-full border-collapse text-xs">
            <thead className="bg-muted/60">
              <tr className="border-b text-left">
                <th className="border-r p-2">Nr.</th>
                <th className="border-r p-2">Plytelė</th>
                <th className="border-r p-2">Matmenys</th>
                <th className="border-r p-2">Storis</th>
                <th className="border-r p-2">Kiekis</th>
                <th className="border-r p-2">Pasirinkimai</th>
                <th className="p-2">Pakavimas</th>
              </tr>
            </thead>
            <tbody>
              {proposal.tileLines.map((line, index) => {
                const tile = getTileById(line.tileId);
                const choices = describePackagingChoices(line.packaging).slice(0, 4);
                const packaging = describePackagingChoices(line.packaging).slice(4);

                return (
                  <tr key={line.id} className="border-b align-top">
                    <td className="border-r p-2">{index + 1}</td>
                    <td className="border-r p-2">
                      <p className="font-medium">{tile?.name ?? "—"}</p>
                      {line.comment ? (
                        <p className="mt-1 text-muted-foreground">{line.comment}</p>
                      ) : null}
                    </td>
                    <td className="border-r p-2">
                      {tile
                        ? formatDimensions(tile.lengthMm, tile.widthMm, tile.heightMm)
                        : "—"}
                    </td>
                    <td className="border-r p-2">
                      {line.showStoris ? `${line.storisMm} mm` : "—"}
                    </td>
                    <td className="border-r p-2">{line.quantityPallets} pal.</td>
                    <td className="border-r p-2">
                      <ul className="space-y-1">
                        {choices.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </td>
                    <td className="p-2">
                      {packaging.map((item) => (
                        <p key={item}>{item}</p>
                      ))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {proposal.comment ? (
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide">
              Komentaras
            </p>
            <p className="rounded-md border p-3 text-xs">{proposal.comment}</p>
          </div>
        ) : null}

        {proposal.extraClauses.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide">
              Papildomos sąlygos
            </p>
            {proposal.extraClauses.map((clause, index) => (
              <p key={`${clause}-${index}`} className="rounded-md border p-3 text-xs">
                {clause}
              </p>
            ))}
          </div>
        ) : null}

        <Separator />

        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-900">
          <div className="mb-1 flex items-center gap-2">
            <Badge variant="outline" className="border-red-300 text-red-800">
              Pastaba
            </Badge>
          </div>
          <p>{L_CORNER_NOTE}</p>
        </div>
      </CardContent>
    </Card>
  );
}
