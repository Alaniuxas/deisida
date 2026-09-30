"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type {
  PackagingOptions,
  Proposal,
  QuantityUnit,
  Tile,
  TileLine,
} from "@/lib/types";
import { PJUVIS_OPTIONS } from "@/lib/types";
import {
  createDefaultProposal,
  createEmptyTileLine,
  ensureProposalLineCount,
  formatCatalogPrice,
  formatLineStoris,
  getLineCatalogPrice,
  quantityUnitLabel,
  validateProposal,
} from "@/lib/proposal-utils";
import { setRuntimeCatalog } from "@/lib/tiles";
import { TileSearchSelect } from "@/components/tile-search-select";
import { useRouter } from "next/navigation";
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
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { LithuanianDatePicker } from "@/components/lithuanian-date-picker";
import { Textarea } from "@/components/ui/textarea";
import { Download } from "lucide-react";
import {
  clearProposalDraft,
  loadProposalDraft,
  saveProposalDraft,
} from "@/lib/proposal-draft-storage";

type MobileTab = "edit" | "client" | "production";
type PreviewDoc = "client" | "production";
type PdfKind = "client" | "production";

const controlClass = "h-10 w-full bg-paper";
const labelClass =
  "block text-xs font-semibold uppercase tracking-[0.08em] leading-snug text-muted-foreground";

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
    <div className="grid min-w-0 grid-rows-[2.75rem_2.5rem]">
      <div className="flex items-end pb-2">
        <Label htmlFor={htmlFor} className={labelClass}>
          {label}
        </Label>
      </div>
      <div className="flex h-10 items-center">{children}</div>
    </div>
  );
}

function SelectDisplay({
  value,
  placeholder = "Pasirinkite",
}: {
  value: string | null;
  placeholder?: string;
}) {
  return (
    <span
      data-slot="select-value"
      className={cn("truncate", !value && "text-muted-foreground")}
    >
      {value ?? placeholder}
    </span>
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
  const displayValue =
    value === null ? null : value ? "Taip" : "Ne";

  return (
    <FormField label={label} htmlFor={id}>
      <Select
        value={value === null ? "pasirinkite" : value ? "taip" : "ne"}
        onValueChange={(next) => {
          if (!next || next === "pasirinkite") onChange(null);
          else onChange(next === "taip");
        }}
      >
        <SelectTrigger id={id} className={controlClass}>
          <SelectDisplay value={displayValue} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="taip">Taip</SelectItem>
          <SelectItem value="ne">Ne</SelectItem>
        </SelectContent>
      </Select>
    </FormField>
  );
}

function OrderPackagingEditor({
  packaging,
  onChange,
}: {
  packaging: PackagingOptions;
  onChange: (packaging: PackagingOptions) => void;
}) {
  return (
    <>
      <div className="grid gap-x-4 gap-y-6 xl:grid-cols-5">
        <TriStateSelect
          id="order-intact"
          label="Pakuoti tik neskilusi"
          value={packaging.packOnlyIntact}
          onChange={(packOnlyIntact) =>
            onChange({ ...packaging, packOnlyIntact })
          }
        />
        <TriStateSelect
          id="order-two-parts"
          label="Pakuoti į 2 dalis skilusi"
          value={packaging.packTwoParts}
          onChange={(packTwoParts) => onChange({ ...packaging, packTwoParts })}
        />
        <TriStateSelect
          id="order-many-parts"
          label="Pakuoti daugiau nei į 2 dalis (dūžiai)"
          value={packaging.packMoreThanTwoParts}
          onChange={(packMoreThanTwoParts) =>
            onChange({ ...packaging, packMoreThanTwoParts })
          }
        />
        <TriStateSelect
          id="order-leftovers"
          label="Viduriukai (likučiai)"
          value={packaging.needLeftovers}
          onChange={(needLeftovers) => onChange({ ...packaging, needLeftovers })}
        />
      </div>

      <div className="mt-4 grid gap-x-4 gap-y-6 xl:grid-cols-5">
        {[
          ["baseProtection", "Bazinė apsauga"],
          ["bottomInterlayer", "Apatinis perklojimas"],
          ["rowInterlayer", "Kiekvienos eilės perklojimas"],
        ].map(([key, label]) => (
          <FormField key={key} label=" ">
            <label className="flex h-10 w-full items-center gap-2 rounded-md border border-stone-line bg-paper px-3 text-sm">
              <Checkbox
                id={`order-${key}`}
                checked={packaging[key as keyof PackagingOptions] as boolean}
                onCheckedChange={(checked) =>
                  onChange({
                    ...packaging,
                    [key]: checked === true,
                  })
                }
              />
              <span className="line-clamp-2 leading-tight">{label}</span>
            </label>
          </FormField>
        ))}
      </div>
    </>
  );
}

function TileLineEditor({
  line,
  index,
  catalog,
  onChange,
  onRemove,
  canRemove,
}: {
  line: TileLine;
  index: number;
  catalog: Tile[];
  onChange: (line: TileLine) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const tile = catalog.find((item) => item.id === line.tileId);
  const tileLabel = tile?.name ?? null;

  return (
    <div
      id={`tile-line-${index}`}
      data-tile-line={index + 1}
      data-tile-line-id={line.id}
      className="border-b border-stone-line last:border-b-0"
    >
      <div className="flex items-center justify-between bg-[#f3f3f0] px-6 py-3 lg:px-10">
        <h3 className="text-sm font-semibold text-deisida-muted">Eilutė {index + 1}</h3>
        {canRemove ? (
          <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
            Pašalinti
          </Button>
        ) : null}
      </div>

      <div className="grid gap-x-4 gap-y-6 px-6 py-6 lg:px-10 xl:grid-cols-4">
        <FormField label="Plytelė">
          <TileSearchSelect
            inputId={`tile-${line.id}`}
            fieldName={`lineTile-${index}`}
            value={line.tileId}
            catalog={catalog}
            onChange={(tileId) => onChange({ ...line, tileId })}
            className={controlClass}
          />
        </FormField>

        <FormField label={tile ? `Pjovimo storis · ${tile.heightMm} mm` : "Pjovimo storis"}>
          <div
            className={`flex ${controlClass} items-center rounded-md border border-stone-line bg-[#f3f3f0] px-3 text-sm font-medium tabular-nums`}
          >
            {formatLineStoris(line)}
          </div>
        </FormField>

        <FormField label="Kiekis" htmlFor={`quantity-${line.id}`}>
          <div className="flex h-10 gap-2">
              <input type="hidden" name={`lineUnit-${index}`} value={line.quantityUnit} />
            <Input
              id={`quantity-${line.id}`}
              name={`lineQty-${index}`}
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
    </div>
  );
}

function DownloadButtons({
  onDownload,
  loading,
}: {
  onDownload: (kind: PdfKind) => void;
  loading: boolean;
}) {
  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="h-10 gap-2 border-deisida-muted text-deisida-muted hover:bg-[#f3f3f0]"
        onClick={() => onDownload("production")}
        disabled={loading}
      >
        <Download className="size-4" />
        Atsisiųsti gamybai
      </Button>
      <Button
        type="button"
        className="h-10 gap-2 bg-deisida text-deisida-foreground hover:bg-deisida/90"
        onClick={() => onDownload("client")}
        disabled={loading}
      >
        <Download className="size-4" />
        {loading ? "Palaukite…" : "Atsisiųsti klientui"}
      </Button>
    </>
  );
}

interface ProposalCreatorProps {
  catalog: Tile[];
  proposalId?: string;
  initialProposal?: Proposal;
  initialStatus?: string;
  initialLineCount?: number;
  seedTileIds?: string[];
  seedFields?: Partial<
    Pick<
      Proposal,
      | "client"
      | "object"
      | "address"
      | "number"
      | "comment"
      | "pjovimas"
      | "validUntil"
      | "serviceDeadline"
    >
  >;
  initialError?: string | null;
}

function applySeedTileIds(proposal: Proposal, seedTileIds: string[]): Proposal {
  if (seedTileIds.length === 0) return proposal;
  const tileLines = [...proposal.tileLines];
  seedTileIds.forEach((tileId, index) => {
    if (!tileId) return;
    if (tileLines[index]) {
      tileLines[index] = { ...tileLines[index], tileId };
    } else {
      tileLines.push(createEmptyTileLine(tileId));
    }
  });
  return { ...proposal, tileLines };
}

function applySeedFields(
  proposal: Proposal,
  seedFields: ProposalCreatorProps["seedFields"],
): Proposal {
  if (!seedFields) return proposal;
  return {
    ...proposal,
    client: seedFields.client ?? proposal.client,
    object: seedFields.object ?? proposal.object,
    address: seedFields.address ?? proposal.address,
    number: seedFields.number || proposal.number,
    comment: seedFields.comment ?? proposal.comment,
    pjovimas: seedFields.pjovimas || proposal.pjovimas,
    validUntil: seedFields.validUntil || proposal.validUntil,
    serviceDeadline: seedFields.serviceDeadline || proposal.serviceDeadline,
  };
}

function readInputValue(id: string): string | null {
  const element = document.getElementById(id);
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
  ) {
    return element.value;
  }
  return null;
}

function readLineTileValues(): Map<number, string> {
  const values = new Map<number, string>();
  if (typeof document === "undefined") return values;
  document.querySelectorAll("select[name^='lineTile-']").forEach((element) => {
    if (!(element instanceof HTMLSelectElement)) return;
    const match = /^lineTile-(\d+)$/.exec(element.name);
    if (!match) return;
    values.set(Number(match[1]), element.value.trim());
  });
  return values;
}

function readProposalFromDom(current: Proposal): Proposal {
  if (typeof document === "undefined") return current;

  const selectedTiles = readLineTileValues();
  const lastIndex = Math.max(
    current.tileLines.length - 1,
    ...selectedTiles.keys(),
    -1,
  );
  const tileLines: TileLine[] = [];

  for (let index = 0; index <= lastIndex; index += 1) {
    const existing = current.tileLines[index];
    const tileId = selectedTiles.has(index)
      ? (selectedTiles.get(index) ?? "")
      : (existing?.tileId || "");
    const quantityInput = (
      existing
        ? document.getElementById(`quantity-${existing.id}`)
        : document.querySelector(`input[name="lineQty-${index}"]`)
    ) as HTMLInputElement | null;
    const parsedQuantity = quantityInput
      ? Number(quantityInput.value)
      : existing?.quantity;
    const quantity =
      parsedQuantity !== undefined &&
      Number.isFinite(parsedQuantity) &&
      parsedQuantity > 0
        ? parsedQuantity
        : (existing?.quantity ?? 1);

    tileLines.push(
      existing
        ? { ...existing, tileId, quantity }
        : { ...createEmptyTileLine(tileId), quantity },
    );
  }

  return {
    ...current,
    number: readInputValue("number")?.trim() || current.number,
    client: readInputValue("client")?.trim() || current.client,
    object: readInputValue("object")?.trim() || current.object,
    address: readInputValue("address")?.trim() || current.address,
    comment: readInputValue("comment") ?? current.comment,
    pjovimas: readInputValue("pjovimas")?.trim() || current.pjovimas,
    tileLines,
  };
}

function buildInitialProposal(
  catalog: Tile[],
  initialProposal?: Proposal,
  initialLineCount = 1,
  editingId?: string,
  seedTileIds: string[] = [],
  seedFields?: ProposalCreatorProps["seedFields"],
): Proposal {
  const base = initialProposal ?? createDefaultProposal(catalog[0]?.id);
  const seeded = applySeedFields(
    applySeedTileIds(base, seedTileIds),
    seedFields,
  );
  const withLines = ensureProposalLineCount(seeded, initialLineCount);

  if (
    initialProposal ||
    editingId ||
    seedTileIds.some(Boolean) ||
    Boolean(seedFields?.client || seedFields?.object)
  ) {
    return withLines;
  }

  const draft = loadProposalDraft();
  if (!draft) return withLines;

  const merged = ensureProposalLineCount(draft, initialLineCount);
  return merged.tileLines.length >= withLines.tileLines.length ? merged : withLines;
}

export function ProposalCreator({
  catalog,
  proposalId,
  initialProposal,
  initialStatus = "draft",
  initialLineCount = 1,
  seedTileIds = [],
  seedFields,
  initialError = null,
}: ProposalCreatorProps) {
  const router = useRouter();
  const [savedId, setSavedId] = useState<string | undefined>(proposalId);
  const [status, setStatus] = useState(initialStatus);
  const [proposal, setProposal] = useState<Proposal>(() =>
    buildInitialProposal(
      catalog,
      initialProposal,
      initialLineCount,
      proposalId,
      seedTileIds,
      seedFields,
    ),
  );
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(initialError);
  const [pdfState, setPdfState] = useState<"idle" | "loading" | "error">("idle");
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [downloadNote, setDownloadNote] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<MobileTab>("edit");
  const [previewDoc, setPreviewDoc] = useState<PreviewDoc>("client");
  const [isMobileLayout, setIsMobileLayout] = useState(false);
  const pendingScrollLineIndex = useRef<number | null>(null);
  const addLinePath = savedId ? `/pasiulymai/${savedId}` : "/pasiulymai/naujas";

  useLayoutEffect(() => {
    setProposal((current) => readProposalFromDom(current));
  }, []);

  useEffect(() => {
    setRuntimeCatalog(catalog);
  }, [catalog]);

  useEffect(() => {
    setProposal((current) => {
      if (current.tileLines.length >= initialLineCount) return current;
      return ensureProposalLineCount(current, initialLineCount);
    });
  }, [initialLineCount]);

  useEffect(() => {
    if (proposalId || initialProposal) return;
    saveProposalDraft(proposal);
  }, [proposal, proposalId, initialProposal]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 1279px)");
    const update = () => setIsMobileLayout(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!downloadNote) return;
    const timer = window.setTimeout(() => setDownloadNote(null), 7000);
    return () => window.clearTimeout(timer);
  }, [downloadNote]);

  useEffect(() => {
    if (pendingScrollLineIndex.current === null) return;
    const index = pendingScrollLineIndex.current;
    pendingScrollLineIndex.current = null;
    requestAnimationFrame(() => {
      document
        .getElementById(`tile-line-${index}`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [proposal.tileLines.length]);

  const validationErrors = useMemo(
    () => validateProposal(proposal, catalog),
    [proposal, catalog],
  );

  const persistProposal = async (
    nextStatus: "draft" | "sent" | "confirm",
  ): Promise<string | null> => {
    const synced = readProposalFromDom(proposal);
    setProposal(synced);
    const errors = validateProposal(synced, catalog);
    if (errors.length > 0) {
      setFormError(errors[0]);
      return null;
    }

    setSaveState("saving");
    setSaveMessage(null);
    setFormError(null);

    try {
      const response = await fetch(
        savedId ? `/api/proposals/${savedId}` : "/api/proposals",
        {
          method: savedId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            proposal: synced,
            status: nextStatus === "confirm" ? "sent" : nextStatus,
            id: savedId,
          }),
        },
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Nepavyko išsaugoti.");
      }

      const id = data.proposal?.id as string;
      setSavedId(id);
      if (nextStatus !== "confirm") {
        setStatus(nextStatus);
      }
      setSaveState("saved");
      setSaveMessage(
        nextStatus === "draft"
          ? "Juodraštis išsaugotas."
          : nextStatus === "sent"
            ? "Pasiūlymas pažymėtas kaip išsiųstas."
            : "Patvirtinama…",
      );

      if (!savedId && id) {
        router.replace(`/pasiulymai/${id}`);
      }

      if (nextStatus === "confirm" && id) {
        const confirmResponse = await fetch(`/api/proposals/${id}/confirm`, {
          method: "POST",
        });
        const confirmData = await confirmResponse.json();
        if (!confirmResponse.ok) {
          throw new Error(confirmData.error ?? "Nepavyko patvirtinti.");
        }
        setStatus("confirmed");
        const lineCount = synced.tileLines.length;
        const created = confirmData.jobsCreated ?? 0;
        setSaveMessage(
          `Pasiūlymas patvirtintas. Sukurta ${created} gamybos ${created === 1 ? "darbas" : "darbai"} (${lineCount} plytelių ${lineCount === 1 ? "tipas" : "tipai"}).`,
        );
        clearProposalDraft();
      }

      return id;
    } catch (error) {
      setSaveState("error");
      setSaveMessage(
        error instanceof Error ? error.message : "Nepavyko išsaugoti.",
      );
      return null;
    }
  };

  const addTileLine = () => {
    setProposal((current) => {
      const tileLines = [...current.tileLines, createEmptyTileLine()];
      pendingScrollLineIndex.current = tileLines.length - 1;
      return { ...current, tileLines };
    });
  };

  const removeTileLine = (index: number) => {
    setProposal((current) => ({
      ...current,
      tileLines: current.tileLines.filter((_, idx) => idx !== index),
    }));
  };

  const updateLine = (index: number, line: TileLine) => {
    setProposal((current) => ({
      ...current,
      tileLines: current.tileLines.map((item, idx) => (idx === index ? line : item)),
    }));
  };

  const handleDownloadPdf = async (kind: PdfKind) => {
    setDownloadNote(null);
    setDownloadError(null);

    const synced = readProposalFromDom(proposal);
    setProposal(synced);
    const errors = validateProposal(synced, catalog);
    if (errors.length > 0) {
      setFormError(errors[0]);
      setDownloadError(errors[0]);
      return;
    }

    setFormError(null);
    setPdfState("loading");
    setPdfError(null);

    try {
      const filename =
        kind === "client"
          ? await downloadClientProposalPdf(synced)
          : await downloadProductionProposalPdf(synced);
      setDownloadNote(`Atsisiųsta: ${filename}`);
      setPdfState("idle");
    } catch (error) {
      setPdfState("error");
      const message =
        error instanceof Error ? error.message : "Nepavyko paruošti failo.";
      setPdfError(message);
      setDownloadError(message);
    }
  };

  const showEditor = mobileTab === "edit";
  const showClientPreview =
    mobileTab === "client" || (!isMobileLayout && previewDoc === "client");
  const showProductionPreview =
    mobileTab === "production" || (!isMobileLayout && previewDoc === "production");

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <form
        id="proposal-form"
        method="post"
        action="/api/proposals/submit"
        className="contents"
        data-proposal-form
      >
        {savedId ? <input type="hidden" name="proposalId" value={savedId} /> : null}
        <input type="hidden" name="validUntil" value={proposal.validUntil} />
        <input type="hidden" name="serviceDeadline" value={proposal.serviceDeadline} />
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
              onClick={() =>
                setProposal(createDefaultProposal(catalog[0]?.id))
              }
            >
              Naujas pasiūlymas
            </Button>
            <button
              type="submit"
              name="intent"
              value="draft"
              formAction="/api/proposals/submit"
              disabled={saveState === "saving" || status === "confirmed"}
              className="inline-flex h-10 items-center justify-center rounded-md border border-stone-line bg-paper px-4 text-sm font-medium hover:bg-muted/60 disabled:opacity-50"
            >
              {saveState === "saving" ? "Saugoma…" : "Išsaugoti juodraštį"}
            </button>
            <button
              type="submit"
              name="intent"
              value="sent"
              formAction="/api/proposals/submit"
              disabled={saveState === "saving" || status === "confirmed"}
              className="inline-flex h-10 items-center justify-center rounded-md border border-deisida-muted px-4 text-sm font-medium text-deisida-muted disabled:opacity-50"
            >
              Pažymėti išsiųstu
            </button>
            <button
              type="submit"
              name="intent"
              value="confirm"
              formAction="/api/proposals/submit"
              data-confirm-proposal
              disabled={saveState === "saving" || status === "confirmed"}
              className="inline-flex h-10 items-center justify-center rounded-md bg-deisida px-4 text-sm font-medium text-deisida-foreground hover:bg-deisida/90 disabled:opacity-50"
            >
              Patvirtinti
            </button>
            <DownloadButtons
              onDownload={handleDownloadPdf}
              loading={pdfState === "loading"}
            />
          </div>
        </div>
        {saveMessage ? (
          <div className="border-t border-stone-line bg-[#eef6ee] px-6 py-3 text-sm text-[#2d5a2d] lg:px-10">
            {saveMessage}
          </div>
        ) : null}
        {downloadNote ? (
          <div className="border-t border-stone-line bg-[#eef6ee] px-6 py-3 text-sm text-[#2d5a2d] lg:px-10">
            {downloadNote}
          </div>
        ) : downloadError ? (
          <div className="border-t border-stone-line bg-[#fdeeee] px-6 py-3 text-sm text-destructive lg:px-10">
            {downloadError}
          </div>
        ) : null}
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

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden xl:flex-row">
        <div
          className={`min-h-0 min-w-0 flex-1 overflow-y-auto ${
            showEditor ? "block" : "hidden xl:block"
          }`}
        >
          <section className="border-b border-stone-line bg-white px-6 py-8 lg:px-10">
            <h2 className="mb-6 text-lg font-semibold text-deisida-muted">
              Pasiūlymo duomenys
            </h2>
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              <FormField label="Pasiūlymo numeris" htmlFor="number">
                <Input
                  id="number"
                  name="number"
                  value={proposal.number}
                  onChange={(event) =>
                    setProposal({ ...proposal, number: event.target.value })
                  }
                  className={controlClass}
                />
              </FormField>
              <FormField label="Pasiūlymo galiojimo pabaiga" htmlFor="valid-until">
                <LithuanianDatePicker
                  id="valid-until"
                  value={proposal.validUntil}
                  onChange={(validUntil) =>
                    setProposal({ ...proposal, validUntil })
                  }
                />
              </FormField>
              <FormField label="Paslaugos atlikimo terminas" htmlFor="service-deadline">
                <LithuanianDatePicker
                  id="service-deadline"
                  value={proposal.serviceDeadline}
                  onChange={(serviceDeadline) =>
                    setProposal({ ...proposal, serviceDeadline })
                  }
                />
              </FormField>
              <FormField label="Klientas" htmlFor="client">
                <Input
                  id="client"
                  name="client"
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
                  name="object"
                  value={proposal.object}
                  onChange={(event) =>
                    setProposal({ ...proposal, object: event.target.value })
                  }
                  placeholder="Objekto pavadinimas"
                  aria-invalid={!proposal.object.trim()}
                  className={controlClass}
                />
              </FormField>
              <FormField label="Adresas" htmlFor="address">
                <Input
                  id="address"
                  name="address"
                  value={proposal.address}
                  onChange={(event) =>
                    setProposal({ ...proposal, address: event.target.value })
                  }
                  placeholder="Objekto adresas"
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
                name="comment"
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

          <section
            className="bg-white"
            data-tile-lines-section
            data-tile-lines-count={proposal.tileLines.length}
          >
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-line px-6 py-6 lg:px-10">
              <h2 className="text-lg font-semibold text-deisida-muted">Plytelės</h2>
              <input
                type="hidden"
                name="lines"
                value={proposal.tileLines.length + 1}
              />
              <button
                type="submit"
                formMethod="get"
                formAction={addLinePath}
                data-add-tile-line
                className="inline-flex h-10 items-center justify-center rounded-md border border-stone-line bg-paper px-4 text-sm font-medium hover:bg-muted/60"
              >
                Pridėti eilutę
              </button>
            </div>

            {proposal.tileLines.map((line, index) => (
              <TileLineEditor
                key={line.id}
                line={line}
                index={index}
                catalog={catalog}
                onChange={(next) => updateLine(index, next)}
                onRemove={() => removeTileLine(index)}
                canRemove={proposal.tileLines.length > 1}
              />
            ))}
          </section>

          <section className="border-t border-stone-line bg-white px-6 py-8 lg:px-10">
            <h2 className="mb-6 text-lg font-semibold text-deisida-muted">
              Pjūviai ir pakavimas
            </h2>
            <div className="mb-8 max-w-xl">
              <FormField label="Pjūviai (baras)" htmlFor="pjovimas">
                <select
                  id="pjovimas"
                  name="pjovimas"
                  value={proposal.pjovimas}
                  onChange={(event) =>
                    setProposal({ ...proposal, pjovimas: event.target.value })
                  }
                  className={`${controlClass} rounded-md border border-input bg-paper px-3 text-sm`}
                >
                  <option value="" disabled>Pasirinkite pjūvį</option>
                  {PJUVIS_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </FormField>
            </div>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-[0.1em] text-deisida-muted">
              Skilimų paketavimas
            </h3>
            <p className="mb-6 text-sm text-muted-foreground">
              Nurodykite, kaip pakuoti skilusias plyteles ir ar reikalingi viduriukai (likučiai).
            </p>
            <OrderPackagingEditor
              packaging={proposal.packaging}
              onChange={(packaging) => setProposal({ ...proposal, packaging })}
            />
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
          className={`min-h-0 flex-col overflow-hidden border-stone-line bg-[#f3f3f0] xl:w-[min(520px,42vw)] xl:flex-shrink-0 xl:border-l ${
            mobileTab === "edit" ? "hidden xl:flex" : "flex"
          }`}
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
      </form>
    </div>
  );
}
