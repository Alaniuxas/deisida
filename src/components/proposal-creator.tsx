"use client";

import { useEffect, useMemo, useState } from "react";
import type { Proposal, TileLine } from "@/lib/types";
import { PJUVIS_OPTIONS } from "@/lib/types";
import { applyPromptCorrection } from "@/lib/prompt-corrections";
import {
  createDefaultProposal,
  createEmptyTileLine,
  formatCatalogPrice,
  formatDimensions,
  getLineCatalogPrice,
  validateProposal,
} from "@/lib/proposal-utils";
import { TILE_CATALOG } from "@/lib/tiles";
import { downloadProposalPdf } from "@/components/pdf/proposal-pdf";
import { PromptCorrectionBox } from "@/components/prompt-correction-box";
import { ProposalPreview } from "@/components/proposal-preview";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

function TriStateSelect({
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
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs leading-snug text-muted-foreground">
        {label}
      </Label>
      <Select
        value={value === null ? "unset" : value ? "yes" : "no"}
        onValueChange={(next) => {
          if (next === "unset") onChange(null);
          else onChange(next === "yes");
        }}
      >
        <SelectTrigger id={id} className="w-full bg-paper">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="yes">Taip</SelectItem>
          <SelectItem value="no">Ne</SelectItem>
          <SelectItem value="unset">Nenurodyta</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

function TileLineEditor({
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
  const tile = TILE_CATALOG.find((item) => item.id === line.tileId);

  return (
    <section className="editor-panel overflow-hidden">
      <div className="flex items-center justify-between border-b border-stone-line bg-[#faf7f2] px-4 py-3">
        <h3 className="font-serif text-base font-semibold">Eilutė {index + 1}</h3>
        {canRemove ? (
          <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
            Pašalinti
          </Button>
        ) : null}
      </div>

      <div className="grid gap-3 border-b border-stone-line p-4 lg:grid-cols-[1.4fr_1.2fr_0.7fr_0.7fr]">
        <div className="space-y-1.5">
          <Label className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
            Plytelė
          </Label>
          <Select
            value={line.tileId}
            onValueChange={(tileId) => {
              if (!tileId) return;
              const selected = TILE_CATALOG.find((item) => item.id === tileId);
              onChange({
                ...line,
                tileId,
                storisMm: selected?.defaultStorisMm ?? line.storisMm,
              });
            }}
          >
            <SelectTrigger className="bg-paper">
              <SelectValue placeholder="Pasirinkite plytelę" />
            </SelectTrigger>
            <SelectContent>
              {TILE_CATALOG.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
            Pjūvis
          </Label>
          <Select
            value={line.pjovimas}
            onValueChange={(pjovimas) => {
              if (!pjovimas) return;
              onChange({ ...line, pjovimas });
            }}
          >
            <SelectTrigger className="bg-paper">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PJUVIS_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label
            htmlFor={`quantity-${line.id}`}
            className="text-xs uppercase tracking-[0.12em] text-muted-foreground"
          >
            Kiekis
          </Label>
          <div className="flex items-center gap-2">
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
              className="bg-paper tabular-nums"
            />
            <span className="text-xs text-muted-foreground">pal.</span>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
            Kaina
          </Label>
          <div className="flex h-8 items-center rounded-lg border border-stone-line bg-[#f7f2ea] px-3 text-sm font-medium tabular-nums">
            {formatCatalogPrice(getLineCatalogPrice(line))}
          </div>
        </div>
      </div>

      <aside className="space-y-5 bg-[#fcfaf6] p-4">
        <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          Papildoma informacija · neįeina į pagrindinę eilutę
        </p>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor={`storis-${line.id}`}>Storis (mm)</Label>
            <Input
              id={`storis-${line.id}`}
              type="number"
              min={1}
              value={line.storisMm}
              disabled={!line.showStoris}
              onChange={(event) =>
                onChange({ ...line, storisMm: Number(event.target.value) })
              }
              className="bg-paper"
            />
            <p className="text-xs text-muted-foreground">
              Aukštis kataloge: {tile ? `${tile.heightMm} mm` : "—"}
            </p>
          </div>

          <TriStateSelect
            id={`${line.id}-intact`}
            label="Pakuoti tik neskilusi"
            value={line.packaging.packOnlyIntact}
            onChange={(packOnlyIntact) =>
              onChange({
                ...line,
                packaging: { ...line.packaging, packOnlyIntact },
              })
            }
          />
          <TriStateSelect
            id={`${line.id}-two-parts`}
            label="Pakuoti į 2 dalis skilusi"
            value={line.packaging.packTwoParts}
            onChange={(packTwoParts) =>
              onChange({
                ...line,
                packaging: { ...line.packaging, packTwoParts },
              })
            }
          />
          <TriStateSelect
            id={`${line.id}-many-parts`}
            label="Pakuoti daugiau nei į 2 dalis"
            value={line.packaging.packMoreThanTwoParts}
            onChange={(packMoreThanTwoParts) =>
              onChange({
                ...line,
                packaging: { ...line.packaging, packMoreThanTwoParts },
              })
            }
          />
          <TriStateSelect
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

        <div className="grid gap-3 sm:grid-cols-3">
          {[
            ["baseProtection", "Bazinė apsauga"],
            ["bottomInterlayer", "Apatinis perklojimas"],
            ["rowInterlayer", "Kiekvienos eilės perklojimas"],
          ].map(([key, label]) => (
            <label
              key={key}
              className="flex items-center gap-2 rounded-lg border border-stone-line bg-paper px-3 py-2 text-sm"
            >
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
              <span>{label}</span>
            </label>
          ))}
        </div>

        {tile ? (
          <div className="rounded-lg border border-dashed border-stone-line px-3 py-2 text-xs leading-relaxed text-muted-foreground">
            <p>
              {tile.supplier}
              {tile.manufacturer ? ` · ${tile.manufacturer}` : ""}
            </p>
            <p>
              Matmenys:{" "}
              {formatDimensions(tile.lengthMm, tile.widthMm, tile.heightMm)}
              {tile.disc ? ` · ${tile.disc}` : ""}
            </p>
            {tile.description ? <p className="mt-1">{tile.description}</p> : null}
          </div>
        ) : null}

        <div className="space-y-1.5">
          <Label htmlFor={`comment-${line.id}`}>Komentaras plytelei</Label>
          <Textarea
            id={`comment-${line.id}`}
            value={line.comment}
            onChange={(event) =>
              onChange({ ...line, comment: event.target.value })
            }
            placeholder="Techninė pastaba šiai eilutei"
            rows={2}
            className="bg-paper"
          />
        </div>
      </aside>
    </section>
  );
}

function EditorPanel({
  proposal,
  setProposal,
  promptMessages,
  onPromptApply,
  formError,
  validationErrors,
  pdfState,
  pdfError,
  updateLine,
}: {
  proposal: Proposal;
  setProposal: (proposal: Proposal) => void;
  promptMessages: string[];
  onPromptApply: (prompt: string) => void;
  formError: string | null;
  validationErrors: string[];
  pdfState: "idle" | "loading" | "error";
  pdfError: string | null;
  updateLine: (index: number, line: TileLine) => void;
}) {
  return (
    <div className="space-y-5">
      <section className="editor-panel p-5">
        <h2 className="font-serif text-lg font-semibold">Pasiūlymo antraštė</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="number">Pasiūlymo numeris</Label>
            <Input
              id="number"
              value={proposal.number}
              onChange={(event) =>
                setProposal({ ...proposal, number: event.target.value })
              }
              className="bg-paper"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="valid-until">Galiojimo pabaiga</Label>
            <Input
              id="valid-until"
              type="date"
              value={proposal.validUntil}
              onChange={(event) =>
                setProposal({ ...proposal, validUntil: event.target.value })
              }
              className="bg-paper"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="service-deadline">Paslaugos terminas</Label>
            <Input
              id="service-deadline"
              type="date"
              value={proposal.serviceDeadline}
              onChange={(event) =>
                setProposal({ ...proposal, serviceDeadline: event.target.value })
              }
              className="bg-paper"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="client">Klientas</Label>
            <Input
              id="client"
              value={proposal.client}
              onChange={(event) =>
                setProposal({ ...proposal, client: event.target.value })
              }
              placeholder="Įveskite kliento pavadinimą"
              aria-invalid={!proposal.client.trim()}
              className="bg-paper"
            />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="object">Objektas</Label>
            <Input
              id="object"
              value={proposal.object}
              onChange={(event) =>
                setProposal({ ...proposal, object: event.target.value })
              }
              placeholder="Įveskite objekto pavadinimą"
              aria-invalid={!proposal.object.trim()}
              className="bg-paper"
            />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="comment">Komentaras</Label>
            <Textarea
              id="comment"
              value={proposal.comment}
              onChange={(event) =>
                setProposal({ ...proposal, comment: event.target.value })
              }
              placeholder="Bendras pasiūlymo komentaras klientui"
              rows={3}
              className="bg-paper"
            />
          </div>
        </div>
      </section>

      <PromptCorrectionBox onApply={onPromptApply} messages={promptMessages} />

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-serif text-lg font-semibold">Pasiūlymo eilutės</h2>
            <p className="text-sm text-muted-foreground">
              Pagrindinėje eilutėje tik plytelė, pjūvis, kiekis ir kaina.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-stone-line bg-paper"
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

        {proposal.tileLines.map((line, index) => (
          <TileLineEditor
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
        ))}
      </section>

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
    </div>
  );
}

export function ProposalCreator() {
  const [proposal, setProposal] = useState<Proposal>(() => createDefaultProposal());
  const [promptMessages, setPromptMessages] = useState<string[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [pdfState, setPdfState] = useState<"idle" | "loading" | "error">("idle");
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<"edit" | "doc">("edit");
  const [isMobileLayout, setIsMobileLayout] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 1279px)");
    const update = () => setIsMobileLayout(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

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
    setMobileTab("doc");
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-stone-line bg-[#1c1917] text-[#faf8f4]">
        <div className="mx-auto flex max-w-[1400px] flex-col gap-4 px-4 py-5 lg:flex-row lg:items-end lg:justify-between lg:px-8">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-[#d8cfc0]">
              Deisida · pardavimo įrankis
            </p>
            <h1 className="mt-1 font-serif text-3xl font-semibold tracking-tight">
              Pasiūlymo kūrimas
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-[#d8cfc0]">
              Kurkite kliento pasiūlymą kaip tikrą komercinį dokumentą — aiški
              pagrindinė eilutė ir techninė informacija šalia.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className="border-[#57534e] bg-transparent text-[#faf8f4] hover:bg-[#292524] hover:text-white"
              onClick={() => setProposal(createDefaultProposal())}
            >
              Naujas pasiūlymas
            </Button>
            <Button
              type="button"
              className="bg-deisida text-deisida-foreground hover:bg-deisida/90"
              onClick={handleDownloadPdf}
              disabled={pdfState === "loading"}
            >
              {pdfState === "loading" ? "Generuojama…" : "Atsisiųsti PDF"}
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-4 py-6 lg:px-8">
        <div className="mb-4 xl:hidden">
          <Tabs
            value={mobileTab}
            onValueChange={(value) => setMobileTab(value as "edit" | "doc")}
          >
            <TabsList className="grid w-full grid-cols-2 bg-[#ebe4d8]">
              <TabsTrigger value="edit">Redaguoti</TabsTrigger>
              <TabsTrigger value="doc">Dokumentas</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(420px,0.95fr)]">
          <div className={mobileTab === "doc" ? "hidden xl:block" : "block"}>
            <EditorPanel
              proposal={proposal}
              setProposal={setProposal}
              promptMessages={promptMessages}
              onPromptApply={handlePromptApply}
              formError={formError}
              validationErrors={validationErrors}
              pdfState={pdfState}
              pdfError={pdfError}
              updateLine={updateLine}
            />
          </div>
          <div
            className={`${mobileTab === "edit" ? "hidden xl:block" : "block"} xl:sticky xl:top-6 xl:self-start`}
          >
            <p className="mb-3 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
              Dokumento peržiūra · A4
            </p>
            <ProposalPreview
              proposal={proposal}
              loading={pdfState === "loading"}
              error={pdfState === "error" ? pdfError : null}
              compact={isMobileLayout && mobileTab === "doc"}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
