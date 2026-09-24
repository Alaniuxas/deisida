"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { Proposal, QuantityUnit, TileLine } from "@/lib/types";
import { PJUVIS_OPTIONS } from "@/lib/types";
import {
  createDefaultProposal,
  createEmptyTileLine,
  formatCatalogPrice,
  formatDimensions,
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
type PdfKind = "client" | "production";

const controlClass = "h-10 w-full bg-paper";
const labelClass =
  "mb-2 block text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground";

function FormField({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <Label htmlFor={htmlFor} className={labelClass}>
        {label}
      </Label>
      <div className="h-10">{children}</div>
    </div>
  );
}

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
    <FormField label={label} htmlFor={id}>
      <Select
        value={value === null ? undefined : value ? "yes" : "no"}
        onValueChange={(next) => {
          if (!next) onChange(null);
          else onChange(next === "yes");
        }}
      >
        <SelectTrigger id={id} className={controlClass}>
          <SelectValue placeholder="Pasirinkite" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="yes">Taip</SelectItem>
          <SelectItem value="no">Ne</SelectItem>
        </SelectContent>
      </Select>
    </FormField>
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
    <div className="border-b border-stone-line last:border-b-0">
      <div className="flex items-center justify-between bg-[#f3f3f0] px-6 py-3 lg:px-10">
        <h3 className="text-sm font-semibold text-deisida-muted">Eilutė {index + 1}</h3>
        {canRemove ? (
          <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
            Pašalinti
          </Button>
        ) : null}
      </div>

      <div className="grid gap-6 px-6 py-6 lg:px-10 xl:grid-cols-4">
        <FormField label="Plytelė">
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
            <SelectTrigger className={controlClass}>
              <SelectValue placeholder="Pasirinkite" />
            </SelectTrigger>
            <SelectContent>
              {TILE_CATALOG.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>

        <FormField label="Baras (pjūvis)">
          <Select
            value={line.pjovimas}
            onValueChange={(pjovimas) => {
              if (!pjovimas) return;
              onChange({ ...line, pjovimas });
            }}
          >
            <SelectTrigger className={controlClass}>
              <SelectValue placeholder="Pasirinkite" />
            </SelectTrigger>
            <SelectContent>
              {PJUVIS_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>

        <FormField label="Kiekis" htmlFor={`quantity-${line.id}`}>
          <div className="flex h-10 gap-2">
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
              className={`${controlClass} min-w-0 flex-1`}
            />
            <div className="flex h-10 shrink-0 overflow-hidden rounded-md border border-stone-line">
              {(["pieces", "pallets"] as QuantityUnit[]).map((unit) => (
                <button
                  key={unit}
                  type="button"
                  className={`px-3 text-xs font-medium transition-colors ${
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
        </FormField>

        <FormField label="Kaina už vnt.">
          <div
            className={`flex ${controlClass} items-center rounded-md border border-stone-line bg-[#f3f3f0] px-3 text-sm font-medium tabular-nums`}
          >
            {formatCatalogPrice(getLineCatalogPrice(line))}
          </div>
        </FormField>
      </div>

      <div className="border-t border-stone-line bg-white px-6 py-8 lg:px-10">
        <h4 className="mb-6 text-sm font-semibold uppercase tracking-[0.1em] text-deisida-muted">
          Gamyba ir pakavimas
        </h4>

        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-5">
          <FormField
            label={
              tile
                ? `Pjovimo storis (mm) · aukštis ${tile.heightMm} mm`
                : "Pjovimo storis (mm)"
            }
            htmlFor={`storis-${line.id}`}
          >
            <Input
              id={`storis-${line.id}`}
              type="number"
              min={1}
              value={line.storisMm}
              disabled={!line.showStoris}
              onChange={(event) =>
                onChange({ ...line, storisMm: Number(event.target.value) })
              }
              className={controlClass}
            />
          </FormField>

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

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {[
            ["baseProtection", "Bazinė apsauga"],
            ["bottomInterlayer", "Apatinis perklojimas"],
            ["rowInterlayer", "Kiekvienos eilės perklojimas"],
          ].map(([key, label]) => (
            <label
              key={key}
              className="flex h-10 items-center gap-2 rounded-md border border-stone-line bg-paper px-3 text-sm"
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
          <div className="mt-6 rounded-md border border-dashed border-stone-line px-4 py-3 text-sm leading-relaxed text-muted-foreground">
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

        <div className="mt-6">
          <Label htmlFor={`comment-${line.id}`} className={labelClass}>
            Pastaba gamybai
          </Label>
          <Textarea
            id={`comment-${line.id}`}
            value={line.comment}
            onChange={(event) => onChange({ ...line, comment: event.target.value })}
            placeholder="Jei reikia, parašykite pastabą gamybai"
            rows={2}
            className="mt-0 min-h-20 bg-paper"
          />
        </div>
      </div>
    </div>
  );
}

export function ProposalCreator() {
  const [proposal, setProposal] = useState<Proposal>(() => createDefaultProposal());
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
      if (kind === "client") {
        await downloadClientProposalPdf(proposal);
      } else {
        await downloadProductionProposalPdf(proposal);
      }
      setPdfState("idle");
    } catch (error) {
      setPdfState("error");
      setPdfError(
        error instanceof Error ? error.message : "Nepavyko paruošti failo.",
      );
    }
  };

  const showEditor = mobileTab === "edit";
  const showClientPreview =
    mobileTab === "client" || (!isMobileLayout && previewDoc === "client");
  const showProductionPreview =
    mobileTab === "production" || (!isMobileLayout && previewDoc === "production");

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-stone-line bg-white">
        <div className="flex flex-col gap-4 px-6 py-5 lg:flex-row lg:items-end lg:justify-between lg:px-10">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-deisida">
              Deisida
            </p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-deisida-muted">
              Pasiūlymo kūrimas
            </h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-10 border-stone-line bg-paper"
              onClick={() => setProposal(createDefaultProposal())}
            >
              Naujas pasiūlymas
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-10 border-deisida-muted text-deisida-muted hover:bg-[#f3f3f0]"
              onClick={() => handleDownloadPdf("production")}
              disabled={pdfState === "loading"}
            >
              Gamybai
            </Button>
            <Button
              type="button"
              className="h-10 bg-deisida text-deisida-foreground hover:bg-deisida/90"
              onClick={() => handleDownloadPdf("client")}
              disabled={pdfState === "loading"}
            >
              {pdfState === "loading" ? "Palaukite…" : "Klientui"}
            </Button>
          </div>
        </div>
      </header>

      <div className="mb-0 border-b border-stone-line bg-[#ececea] xl:hidden">
        <Tabs
          value={mobileTab}
          onValueChange={(value) => setMobileTab(value as MobileTab)}
          className="px-4 py-3"
        >
          <TabsList className="grid h-10 w-full grid-cols-3">
            <TabsTrigger value="edit">Redaguoti</TabsTrigger>
            <TabsTrigger value="client">Klientui</TabsTrigger>
            <TabsTrigger value="production">Gamyba</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="flex min-h-0 flex-1 flex-col xl:flex-row">
        <div
          className={`min-w-0 flex-1 ${showEditor ? "block" : "hidden xl:block"} xl:overflow-y-auto`}
        >
          <section className="border-b border-stone-line bg-white px-6 py-8 lg:px-10">
            <h2 className="mb-6 text-lg font-semibold text-deisida-muted">
              Pasiūlymo duomenys
            </h2>
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              <FormField label="Pasiūlymo numeris" htmlFor="number">
                <Input
                  id="number"
                  value={proposal.number}
                  onChange={(event) =>
                    setProposal({ ...proposal, number: event.target.value })
                  }
                  className={controlClass}
                />
              </FormField>
              <FormField label="Galiojimo pabaiga" htmlFor="valid-until">
                <Input
                  id="valid-until"
                  type="date"
                  value={proposal.validUntil}
                  onChange={(event) =>
                    setProposal({ ...proposal, validUntil: event.target.value })
                  }
                  className={controlClass}
                />
              </FormField>
              <FormField label="Paslaugos terminas" htmlFor="service-deadline">
                <Input
                  id="service-deadline"
                  type="date"
                  value={proposal.serviceDeadline}
                  onChange={(event) =>
                    setProposal({ ...proposal, serviceDeadline: event.target.value })
                  }
                  className={controlClass}
                />
              </FormField>
              <FormField label="Klientas" htmlFor="client">
                <Input
                  id="client"
                  value={proposal.client}
                  onChange={(event) =>
                    setProposal({ ...proposal, client: event.target.value })
                  }
                  placeholder="Kliento pavadinimas"
                  aria-invalid={!proposal.client.trim()}
                  className={controlClass}
                />
              </FormField>
              <FormField label="Objektas" htmlFor="object">
                <Input
                  id="object"
                  value={proposal.object}
                  onChange={(event) =>
                    setProposal({ ...proposal, object: event.target.value })
                  }
                  placeholder="Objekto pavadinimas"
                  aria-invalid={!proposal.object.trim()}
                  className={controlClass}
                />
              </FormField>
            </div>
            <div className="mt-6">
              <Label htmlFor="comment" className={labelClass}>
                Pastaba klientui
              </Label>
              <Textarea
                id="comment"
                value={proposal.comment}
                onChange={(event) =>
                  setProposal({ ...proposal, comment: event.target.value })
                }
                placeholder="Jei reikia, parašykite pastabą klientui"
                rows={2}
                className="min-h-20 bg-paper"
              />
            </div>
          </section>

          <section className="bg-white">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-line px-6 py-6 lg:px-10">
              <h2 className="text-lg font-semibold text-deisida-muted">Plytelės</h2>
              <Button
                type="button"
                variant="outline"
                className="h-10 border-stone-line bg-paper"
                onClick={() =>
                  setProposal({
                    ...proposal,
                    tileLines: [...proposal.tileLines, createEmptyTileLine()],
                  })
                }
              >
                Pridėti eilutę
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

          {(formError || validationErrors.length > 0 || pdfError) && (
            <div className="space-y-3 px-6 py-6 lg:px-10">
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
          )}
        </div>

        <aside
          className={`border-stone-line bg-[#f3f3f0] xl:w-[min(520px,42vw)] xl:border-l ${
            mobileTab === "edit" ? "hidden xl:flex" : "flex"
          } min-h-0 flex-col`}
        >
          <div className="flex items-center justify-between border-b border-stone-line px-6 py-4 lg:px-8">
            <h2 className="text-lg font-semibold text-deisida-muted">Peržiūra</h2>
            <Tabs
              value={previewDoc}
              onValueChange={(value) => setPreviewDoc(value as PreviewDoc)}
              className="hidden xl:block"
            >
              <TabsList className="h-10">
                <TabsTrigger value="client">Klientui</TabsTrigger>
                <TabsTrigger value="production">Gamyba</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-6 lg:p-8">
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
        </aside>
      </div>
    </div>
  );
}
