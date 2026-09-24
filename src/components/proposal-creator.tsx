"use client";

import { useMemo, useState } from "react";
import type { Proposal, TileLine } from "@/lib/types";
import { applyPromptCorrection } from "@/lib/prompt-corrections";
import {
  createDefaultProposal,
  createEmptyTileLine,
  validateProposal,
} from "@/lib/proposal-utils";
import { TILE_CATALOG } from "@/lib/tiles";
import { downloadProposalPdf } from "@/components/pdf/proposal-pdf";
import { PromptCorrectionBox } from "@/components/prompt-correction-box";
import { ProposalPreview } from "@/components/proposal-preview";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";

function YesNoField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: boolean | null;
  onChange: (value: boolean | null) => void;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-xs leading-snug">{label}</Label>
      <RadioGroup
        value={value === null ? "unset" : value ? "yes" : "no"}
        onValueChange={(next) => {
          if (next === "unset") onChange(null);
          else onChange(next === "yes");
        }}
        className="flex gap-4"
      >
        <div className="flex items-center gap-2">
          <RadioGroupItem value="yes" id={`${id}-yes`} />
          <Label htmlFor={`${id}-yes`} className="font-normal">
            Taip
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <RadioGroupItem value="no" id={`${id}-no`} />
          <Label htmlFor={`${id}-no`} className="font-normal">
            Ne
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <RadioGroupItem value="unset" id={`${id}-unset`} />
          <Label htmlFor={`${id}-unset`} className="font-normal">
            —
          </Label>
        </div>
      </RadioGroup>
    </div>
  );
}

function TileLineForm({
  line,
  index,
  onChange,
  onRemove,
  canRemove,
}: {
  line: TileLine;
  index: number;
  onChange: (line: TileLine) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const selectedTile = TILE_CATALOG.find((tile) => tile.id === line.tileId);

  return (
    <Card className="border-dashed">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-sm">Plytelių eilutė {index + 1}</CardTitle>
          {canRemove ? (
            <Button type="button" variant="outline" size="sm" onClick={onRemove}>
              Pašalinti
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Plytelės pasirinkimas</Label>
            <Select
              value={line.tileId}
              onValueChange={(tileId) => {
                if (!tileId) return;
                const tile = TILE_CATALOG.find((item) => item.id === tileId);
                onChange({
                  ...line,
                  tileId,
                  storisMm: tile?.defaultStorisMm ?? line.storisMm,
                });
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Pasirinkite plytelę" />
              </SelectTrigger>
              <SelectContent>
                {TILE_CATALOG.map((tile) => (
                  <SelectItem key={tile.id} value={tile.id}>
                    {tile.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedTile ? (
              <p className="text-xs text-muted-foreground">
                {selectedTile.supplier}
                {selectedTile.manufacturer ? ` · ${selectedTile.manufacturer}` : ""}
                {" · "}
                {selectedTile.lengthMm}×{selectedTile.widthMm}×{selectedTile.heightMm} mm
              </p>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`quantity-${line.id}`}>
                Atvykstantis kiekis (paletėmis)
              </Label>
              <Input
                id={`quantity-${line.id}`}
                type="number"
                min={0}
                step={0.5}
                value={line.quantityPallets}
                onChange={(event) =>
                  onChange({
                    ...line,
                    quantityPallets: Number(event.target.value),
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`storis-${line.id}`}>Storis (mm)</Label>
              <Input
                id={`storis-${line.id}`}
                type="number"
                min={1}
                value={line.storisMm}
                disabled={!line.showStoris}
                onChange={(event) =>
                  onChange({
                    ...line,
                    storisMm: Number(event.target.value),
                  })
                }
              />
              <p className="text-xs text-muted-foreground">
                Storis nėra tas pats kaip aukštis (
                {selectedTile ? `${selectedTile.heightMm} mm` : "—"}).
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor={`comment-${line.id}`}>Komentaras plytelei</Label>
          <Textarea
            id={`comment-${line.id}`}
            value={line.comment}
            onChange={(event) =>
              onChange({ ...line, comment: event.target.value })
            }
            placeholder="Įrašykite komentarą plytelei prie kuriamo užsakymo"
            rows={2}
          />
        </div>

        <Separator />

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-4 rounded-md border p-3">
            <p className="text-xs font-semibold uppercase tracking-wide">Pasirinkimai</p>
            <YesNoField
              id={`${line.id}-intact`}
              label="Pakuoti tik neskilusi gaminį"
              value={line.packaging.packOnlyIntact}
              onChange={(packOnlyIntact) =>
                onChange({
                  ...line,
                  packaging: { ...line.packaging, packOnlyIntact },
                })
              }
            />
            <YesNoField
              id={`${line.id}-two-parts`}
              label="Pakuoti į 2 dalis skilusi gaminį"
              value={line.packaging.packTwoParts}
              onChange={(packTwoParts) =>
                onChange({
                  ...line,
                  packaging: { ...line.packaging, packTwoParts },
                })
              }
            />
            <YesNoField
              id={`${line.id}-many-parts`}
              label="Pakuoti daugiau nei į 2 dalis skilusi (visą dūžį)"
              value={line.packaging.packMoreThanTwoParts}
              onChange={(packMoreThanTwoParts) =>
                onChange({
                  ...line,
                  packaging: { ...line.packaging, packMoreThanTwoParts },
                })
              }
            />
            <YesNoField
              id={`${line.id}-leftovers`}
              label="Ar reikalingi likučiai"
              value={line.packaging.needLeftovers}
              onChange={(needLeftovers) =>
                onChange({
                  ...line,
                  packaging: { ...line.packaging, needLeftovers },
                })
              }
            />
          </div>

          <div className="space-y-3 rounded-md border p-3">
            <p className="text-xs font-semibold uppercase tracking-wide">Pakavimas</p>
            {[
              ["baseProtection", "Bazinė apsauga"],
              ["bottomInterlayer", "Apatinis perklojimas"],
              ["rowInterlayer", "Kiekvienos eilės perklojimas"],
            ].map(([key, label]) => (
              <div key={key} className="flex items-center gap-2">
                <Checkbox
                  id={`${line.id}-${key}`}
                  checked={line.packaging[key as keyof typeof line.packaging] as boolean}
                  onCheckedChange={(checked) =>
                    onChange({
                      ...line,
                      packaging: {
                        ...line.packaging,
                        [key]: checked === true,
                      },
                    })
                  }
                />
                <Label htmlFor={`${line.id}-${key}`} className="font-normal">
                  {label}
                </Label>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function ProposalCreator() {
  const [proposal, setProposal] = useState<Proposal>(() => createDefaultProposal());
  const [promptMessages, setPromptMessages] = useState<string[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [pdfState, setPdfState] = useState<"idle" | "loading" | "error">("idle");
  const [pdfError, setPdfError] = useState<string | null>(null);

  const validationErrors = useMemo(() => validateProposal(proposal), [proposal]);

  const updateLine = (index: number, line: TileLine) => {
    setProposal((current) => ({
      ...current,
      tileLines: current.tileLines.map((item, idx) => (idx === index ? line : item)),
    }));
  };

  const handleDownloadPdf = async () => {
    const errors = validateProposal(proposal);
    if (errors.length > 0) {
      setFormError(errors[0]);
      return;
    }

    setFormError(null);
    setPdfState("loading");
    setPdfError(null);

    try {
      await downloadProposalPdf(proposal);
      setPdfState("idle");
    } catch (error) {
      setPdfState("error");
      setPdfError(
        error instanceof Error ? error.message : "Nepavyko sugeneruoti PDF.",
      );
    }
  };

  const handlePromptApply = (prompt: string) => {
    const result = applyPromptCorrection(proposal, prompt);
    setProposal(result.proposal);
    setPromptMessages(result.messages);
    setFormError(null);
  };

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-red-700">Deisida</p>
            <h1 className="text-2xl font-semibold">Pasiūlymo kūrimas</h1>
            <p className="text-sm text-muted-foreground">
              Kurkite kliento PDF su storiu, pakavimo pasirinkimais ir vietinėmis
              pataisomis.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setProposal(createDefaultProposal())}
            >
              Naujas pasiūlymas
            </Button>
            <Button type="button" onClick={handleDownloadPdf} disabled={pdfState === "loading"}>
              {pdfState === "loading" ? "Generuojama…" : "Atsisiųsti PDF"}
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-6 px-4 py-6 xl:grid-cols-[1.05fr_0.95fr]">
        <section className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Pasiūlymo informacija</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="number">Pasiūlymo numeris</Label>
                <Input
                  id="number"
                  value={proposal.number}
                  onChange={(event) =>
                    setProposal({ ...proposal, number: event.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="valid-until">Pasiūlymo galiojimo pabaiga</Label>
                <Input
                  id="valid-until"
                  type="date"
                  value={proposal.validUntil}
                  onChange={(event) =>
                    setProposal({ ...proposal, validUntil: event.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="service-deadline">Paslaugos atlikimo terminas</Label>
                <Input
                  id="service-deadline"
                  type="date"
                  value={proposal.serviceDeadline}
                  onChange={(event) =>
                    setProposal({ ...proposal, serviceDeadline: event.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="client">Klientas</Label>
                <Input
                  id="client"
                  value={proposal.client}
                  onChange={(event) =>
                    setProposal({ ...proposal, client: event.target.value })
                  }
                  placeholder="Ieškokite kliento"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="object">Objektas</Label>
                <Input
                  id="object"
                  value={proposal.object}
                  onChange={(event) =>
                    setProposal({ ...proposal, object: event.target.value })
                  }
                  placeholder="Įveskite objekto pavadinimą"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="comment">Komentaras</Label>
                <Textarea
                  id="comment"
                  value={proposal.comment}
                  onChange={(event) =>
                    setProposal({ ...proposal, comment: event.target.value })
                  }
                  placeholder="Bendras pasiūlymo komentaras"
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold">Plytelių eilutės</h2>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setProposal({
                    ...proposal,
                    tileLines: [...proposal.tileLines, createEmptyTileLine()],
                  })
                }
              >
                + Pridėti eilutę
              </Button>
            </div>

            {proposal.tileLines.length === 0 ? (
              <Alert>
                <AlertTitle>Nėra eilučių</AlertTitle>
                <AlertDescription>
                  Pridėkite bent vieną plytelių eilutę, kad suformuotumėte pasiūlymą.
                </AlertDescription>
              </Alert>
            ) : (
              proposal.tileLines.map((line, index) => (
                <TileLineForm
                  key={line.id}
                  line={line}
                  index={index}
                  onChange={(next) => updateLine(index, next)}
                  onRemove={() =>
                    setProposal({
                      ...proposal,
                      tileLines: proposal.tileLines.filter((_, idx) => idx !== index),
                    })
                  }
                  canRemove={proposal.tileLines.length > 1}
                />
              ))
            )}
          </div>

          <PromptCorrectionBox onApply={handlePromptApply} messages={promptMessages} />

          {formError || validationErrors.length > 0 ? (
            <Alert variant="destructive">
              <AlertTitle>Patikrinkite formą</AlertTitle>
              <AlertDescription>
                {formError ?? validationErrors.join(" ")}
              </AlertDescription>
            </Alert>
          ) : null}

          {pdfState === "error" && pdfError ? (
            <Alert variant="destructive">
              <AlertTitle>PDF klaida</AlertTitle>
              <AlertDescription>{pdfError}</AlertDescription>
            </Alert>
          ) : null}
        </section>

        <section className="xl:sticky xl:top-4 xl:self-start">
          <ProposalPreview
            proposal={proposal}
            loading={pdfState === "loading"}
            error={pdfState === "error" ? pdfError : null}
          />
        </section>
      </main>
    </div>
  );
}
