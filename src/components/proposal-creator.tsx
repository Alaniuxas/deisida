"use client";

import { useEffect, useMemo, useState } from "react";
import type { Proposal, QuantityUnit, TileLine } from "@/lib/types";
import { PJUVIS_OPTIONS } from "@/lib/types";
import { applyPromptCorrection } from "@/lib/prompt-corrections";
import {
  createDefaultProposal,
  createEmptyTileLine,
  formatCatalogPrice,
  formatDimensions,
  formatLineQuantity,
  getLineCatalogPrice,
  quantityUnitLabel,
  validateProposal,
} from "@/lib/proposal-utils";
import { TILE_CATALOG } from "@/lib/tiles";
import {
  downloadClientProposalPdf,
  downloadProductionProposalPdf,
} from "@/components/pdf/proposal-pdf";
import { ClientProposalPreview } from "@/components/client-proposal-preview";
import { ProductionProposalPreview } from "@/components/production-proposal-preview";
import { PromptCorrectionBox } from "@/components/prompt-correction-box";
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

type MobileTab = "edit" | "client" | "production";
type PreviewDoc = "client" | "production";
type PdfKind = "client" | "production" | "both";

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
      <div className="flex items-center justify-between border-b border-stone-line bg-[#f3f3f0] px-4 py-3">
        <h3 className="text-base font-semibold text-deisida-muted">Eilutė {index + 1}</h3>
        {canRemove ? (
          <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
            Pašalinti
          </Button>
        ) : null}
      </div>

      <div className="grid gap-3 border-b border-stone-line p-4 lg:grid-cols-[1.4fr_1.2fr_0.7fr_0.7fr]">
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
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
          <Label className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            Baras (pjūvis)
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
            className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground"
          >
            Kiekis
          </Label>
          <div className="flex items-center gap-2">
            <Input
              id={`quantity-${line.id}`}
              type="number"
              min={0}
              step={line.quantityUnit === "pieces" ? 1 : 0.5}
              value={line.quantity}
              onChange={(event) =>
                onChange({
                  ...line,
                  quantity: Number(event.target.value),
                })
              }
              className="bg-paper tabular-nums"
            />
            <div className="flex shrink-0 overflow-hidden rounded-md border border-stone-line">
              {(["pieces", "pallets"] as QuantityUnit[]).map((unit) => (
                <button
                  key={unit}
                  type="button"
                  className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    line.quantityUnit === unit
                      ? "bg-deisida text-deisida-foreground"
                      : "bg-paper text-muted-foreground hover:bg-[#f3f3f0]"
                  }`}
                  onClick={() => onChange({ ...line, quantityUnit: unit })}
                >
                  {quantityUnitLabel(unit)}
                </button>
              ))}
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Dokumente: {formatLineQuantity(line)}
          </p>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            Kaina už vnt.
          </Label>
          <div className="flex h-8 items-center rounded-md border border-stone-line bg-[#f3f3f0] px-3 text-sm font-medium tabular-nums">
            {formatCatalogPrice(getLineCatalogPrice(line))}
          </div>
        </div>
      </div>

      <aside className="space-y-5 bg-white p-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Gamybos ir pakavimo informacija
        </p>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor={`storis-${line.id}`}>Pjovimo storis (mm)</Label>
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
              className="flex items-center gap-2 rounded-md border border-stone-line bg-paper px-3 py-2 text-sm"
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
          <div className="rounded-md border border-dashed border-stone-line px-3 py-2 text-xs leading-relaxed text-muted-foreground">
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
          <Label htmlFor={`comment-${line.id}`}>Gamybos komentaras</Label>
          <Textarea
            id={`comment-${line.id}`}
            value={line.comment}
            onChange={(event) =>
              onChange({ ...line, comment: event.target.value })
            }
            placeholder="Pastaba gamybai"
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
        <h2 className="text-lg font-semibold text-deisida-muted">Pasiūlymo antraštė</h2>
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
            <Label htmlFor="comment">Pastaba klientui</Label>
            <Textarea
              id="comment"
              value={proposal.comment}
              onChange={(event) =>
                setProposal({ ...proposal, comment: event.target.value })
              }
              placeholder="Jei reikia, parašykite pastabą klientui"
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
            <h2 className="text-lg font-semibold text-deisida-muted">Pasiūlymo eilutės</h2>
            <p className="text-sm text-muted-foreground">
              Klientui rodoma kaina ir kiekis. Gamybai — darbo informacija.
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
          <AlertTitle>Nepavyko paruošti failo</AlertTitle>
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
  const [mobileTab, setMobileTab] = useState<MobileTab>("edit");
  const [previewDoc, setPreviewDoc] = useState<PreviewDoc>("client");
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

  const handleDownloadPdf = async (kind: PdfKind) => {
    const errors = validateProposal(proposal);
    if (errors.length > 0) {
      setFormError(errors[0]);
      return;
    }

    setFormError(null);
    setPdfState("loading");
    setPdfError(null);

    try {
      if (kind === "client" || kind === "both") {
        await downloadClientProposalPdf(proposal);
      }
      if (kind === "production" || kind === "both") {
        await downloadProductionProposalPdf(proposal);
      }
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
    setMobileTab("client");
  };

  const showEditor = mobileTab === "edit";
  const showClientPreview = mobileTab === "client" || (!isMobileLayout && previewDoc === "client");
  const showProductionPreview =
    mobileTab === "production" || (!isMobileLayout && previewDoc === "production");

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-stone-line bg-white">
        <div className="mx-auto flex max-w-[1400px] flex-col gap-4 px-4 py-5 lg:flex-row lg:items-end lg:justify-between lg:px-8">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-deisida">
              Deisida
            </p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-deisida-muted">
              Pasiūlymo kūrimas
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Vienas užsakymas — du dokumentai: klientui ir gamybai.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className="border-stone-line bg-paper"
              onClick={() => setProposal(createDefaultProposal())}
            >
              Naujas pasiūlymas
            </Button>
            <Button
              type="button"
              variant="outline"
              className="border-deisida-muted text-deisida-muted hover:bg-[#f3f3f0]"
              onClick={() => handleDownloadPdf("production")}
              disabled={pdfState === "loading"}
            >
              Gamybai
            </Button>
            <Button
              type="button"
              className="bg-deisida text-deisida-foreground hover:bg-deisida/90"
              onClick={() => handleDownloadPdf("client")}
              disabled={pdfState === "loading"}
            >
              {pdfState === "loading" ? "Palaukite…" : "Klientui"}
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-4 py-6 lg:px-8">
        <div className="mb-4 xl:hidden">
          <Tabs
            value={mobileTab}
            onValueChange={(value) => setMobileTab(value as MobileTab)}
          >
            <TabsList className="grid w-full grid-cols-3 bg-[#ececea]">
              <TabsTrigger value="edit">Redaguoti</TabsTrigger>
              <TabsTrigger value="client">Klientui</TabsTrigger>
              <TabsTrigger value="production">Gamyba</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(420px,0.95fr)]">
          <div className={showEditor ? "block" : "hidden xl:block"}>
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
            <div className="mb-3 hidden items-center justify-between gap-3 xl:flex">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Peržiūra
              </p>
              <Tabs
                value={previewDoc}
                onValueChange={(value) => setPreviewDoc(value as PreviewDoc)}
              >
                <TabsList className="h-8 bg-[#ececea]">
                  <TabsTrigger value="client" className="text-xs">
                    Klientui
                  </TabsTrigger>
                  <TabsTrigger value="production" className="text-xs">
                    Gamyba
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            {showClientPreview ? (
              <ClientProposalPreview
                proposal={proposal}
                loading={pdfState === "loading"}
                error={pdfState === "error" ? pdfError : null}
                compact={isMobileLayout && mobileTab === "client"}
              />
            ) : null}
            {showProductionPreview ? (
              <ProductionProposalPreview
                proposal={proposal}
                loading={pdfState === "loading"}
                error={pdfState === "error" ? pdfError : null}
                compact={isMobileLayout && mobileTab === "production"}
              />
            ) : null}
          </div>
        </div>
      </main>
    </div>
  );
}
