import { format, parseISO } from "date-fns";
import { lt } from "date-fns/locale";
import type { PackagingOptions, Proposal, QuantityUnit, Tile, TileLine } from "./types";
import { PJUVIS_OPTIONS, defaultPackaging } from "./types";
import { getTileById } from "./tiles";

const TILE_FALLBACK_ID = "kolumba-k58";
export const VAT_RATE = 0.21;

export function parseLocalIsoDate(isoDate: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return parseISO(isoDate);
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export function formatIsoDateLocal(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

export function generateProposalNumber(sequence = 2): string {
  const stamp = format(new Date(), "yyMMdd");
  return `DEI${stamp}-${sequence}`;
}

export function createLineId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `line-${crypto.randomUUID()}`;
  }
  return `line-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

export function createEmptyTileLine(tileId?: string, id?: string): TileLine {
  return {
    id: id ?? createLineId(),
    tileId: tileId ?? "",
    quantity: 1,
    quantityUnit: "pallets",
  };
}

export function ensureProposalLineCount(
  proposal: Proposal,
  lineCount: number,
): Proposal {
  const target = Math.min(Math.max(lineCount, 1), 10);
  const tileLines = [...proposal.tileLines];

  while (tileLines.length < target) {
    tileLines.push(createEmptyTileLine());
  }

  return tileLines.length === proposal.tileLines.length
    ? proposal
    : { ...proposal, tileLines };
}

export function createDefaultProposal(tileId?: string): Proposal {
  const today = new Date();
  const inMonth = new Date(today);
  inMonth.setDate(inMonth.getDate() + 30);
  const fallbackTileId = tileId ?? getTileById("kolumba-k58")?.id ?? "kolumba-k58";

  return {
    number: generateProposalNumber(2),
    validUntil: formatIsoDateLocal(inMonth),
    serviceDeadline: formatIsoDateLocal(inMonth),
    client: "",
    object: "",
    address: "",
    comment: "",
    pjovimas: PJUVIS_OPTIONS[0],
    packaging: defaultPackaging(),
    tileLines: [createEmptyTileLine(fallbackTileId, "line-1")],
    extraClauses: [],
  };
}

export function formatLtDate(isoDate: string): string {
  if (!isoDate) return "—";
  try {
    return format(parseLocalIsoDate(isoDate), "yyyy 'm.' MMMM d 'd.'", { locale: lt });
  } catch {
    return isoDate;
  }
}

export function formatDimensions(
  lengthMm: number,
  widthMm: number,
  heightMm: number,
): string {
  return `${lengthMm} × ${widthMm} × ${heightMm} mm`;
}

export function formatYesNo(value: boolean | null): string {
  if (value === null) return "—";
  return value ? "Taip" : "Ne";
}

export function proposalDownloadFilename(
  number: string,
  kind: "Klientui" | "Gamyba",
): string {
  const safe = number.trim().replace(/[^\w\d-]+/g, "_") || "pasiulymas";
  return `${safe}_${kind}.pdf`;
}

export function formatProductionPackagingSummary(
  packaging: PackagingOptions,
): string {
  const rules = [
    packaging.packOnlyIntact !== null
      ? `Tik neskilusi: ${formatYesNo(packaging.packOnlyIntact)}`
      : null,
    packaging.packTwoParts !== null
      ? `2 dalys: ${formatYesNo(packaging.packTwoParts)}`
      : null,
    packaging.packMoreThanTwoParts !== null
      ? `Daugiau nei 2 dalys: ${formatYesNo(packaging.packMoreThanTwoParts)}`
      : null,
  ].filter(Boolean);

  const types: string[] = [];
  if (packaging.baseProtection) types.push("Bazinė apsauga");
  if (packaging.bottomInterlayer) types.push("Apatinis perklojimas");
  if (packaging.rowInterlayer) types.push("Kiekvienos eilės perklojimas");

  const parts = [...rules];
  if (types.length > 0) parts.push(types.join(", "));

  return parts.length > 0 ? parts.join(" · ") : "—";
}

export function formatCatalogPrice(priceEur: number): string {
  if (priceEur <= 0) return "—";
  return new Intl.NumberFormat("lt-LT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(priceEur);
}

export function roundToCents(amount: number): number {
  return Math.round(amount * 100) / 100;
}

export function getLineCatalogPrice(line: TileLine): number {
  return getTileById(line.tileId)?.priceEur ?? 0;
}

/** Catalog price per brick; unchanged by quantity unit. */
export function getLineUnitPrice(line: TileLine): number {
  return getLineCatalogPrice(line);
}

export function getLineSubtotal(line: TileLine): number {
  const unitPrice = getLineCatalogPrice(line);
  if (unitPrice <= 0) return 0;

  if (line.quantityUnit === "pieces") {
    return roundToCents(line.quantity * unitPrice);
  }

  const tile = getTileById(line.tileId);
  const piecesPerPallet = tile?.quantityPerPallet ?? 0;
  return roundToCents(line.quantity * piecesPerPallet * unitPrice);
}

export function getLineStorisMm(line: TileLine): number {
  return getTileById(line.tileId)?.heightMm ?? 0;
}

export function formatLineStoris(line: TileLine): string {
  const storis = getLineStorisMm(line);
  return storis > 0 ? `${storis} mm` : "—";
}

export function getLinePieceCount(line: TileLine): number {
  const tile = getTileById(line.tileId);
  if (!tile) return 0;
  if (line.quantityUnit === "pieces") {
    return Math.round(line.quantity);
  }
  return Math.round(line.quantity * tile.quantityPerPallet);
}

function formatQuantityNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(value).replace(".", ",");
}

export function formatPalletLabel(quantity: number): string {
  if (quantity === 1) return "1 paletė";
  return `${formatQuantityNumber(quantity)} paletės`;
}

export function formatLineQuantity(line: TileLine): string {
  if (line.quantityUnit === "pieces") {
    return `${formatQuantityNumber(line.quantity)} vnt.`;
  }
  return formatPalletLabel(line.quantity);
}

export function quantityUnitLabel(unit: QuantityUnit): string {
  return unit === "pieces" ? "vnt." : "paletės";
}

export interface ProposalPricing {
  subtotal: number;
  vat: number;
  total: number;
}

export function getProposalPricing(proposal: Proposal): ProposalPricing {
  const subtotal = roundToCents(
    proposal.tileLines.reduce((sum, line) => sum + getLineSubtotal(line), 0),
  );
  const vat = roundToCents(subtotal * VAT_RATE);
  const total = roundToCents(subtotal + vat);
  return { subtotal, vat, total };
}

/** @deprecated Use formatLineQuantity */
export const formatPieceQuantity = formatLineQuantity;

export function describePackagingChoices(packaging: PackagingOptions): string[] {
  const lines: string[] = [
    `Pakuoti tik neskilusi gaminį: ${formatYesNo(packaging.packOnlyIntact)}`,
    `Pakuoti į 2 dalis skilusi: ${formatYesNo(packaging.packTwoParts)}`,
    `Pakuoti daugiau nei į 2 dalis (visą dūžį): ${formatYesNo(packaging.packMoreThanTwoParts)}`,
    `Ar reikalingi likučiai: ${formatYesNo(packaging.needLeftovers)}`,
  ];

  const packagingTypes: string[] = [];
  if (packaging.baseProtection) packagingTypes.push("Bazinė apsauga");
  if (packaging.bottomInterlayer) packagingTypes.push("Apatinis perklojimas");
  if (packaging.rowInterlayer) packagingTypes.push("Kiekvienos eilės perklojimas");

  lines.push(
    packagingTypes.length > 0
      ? `Pakavimas: ${packagingTypes.join(", ")}`
      : "Pakavimas: —",
  );

  return lines;
}

/** Client-facing packaging: only affirmative choices and selected types. */
export function describeClientPackaging(packaging: PackagingOptions): string[] {
  const lines: string[] = [];

  if (packaging.packOnlyIntact === true) {
    lines.push("Pakuoti tik neskilusi gaminį");
  }
  if (packaging.packTwoParts === true) {
    lines.push("Pakuoti į 2 dalis skilusi");
  }
  if (packaging.packMoreThanTwoParts === true) {
    lines.push("Pakuoti daugiau nei į 2 dalis (visą dūžį)");
  }
  if (packaging.needLeftovers === true) {
    lines.push("Reikalingi likučiai");
  }
  if (packaging.baseProtection) lines.push("Bazinė apsauga");
  if (packaging.bottomInterlayer) lines.push("Apatinis perklojimas");
  if (packaging.rowInterlayer) lines.push("Kiekvienos eilės perklojimas");

  return lines;
}

export function describeLineSideInfo(line: TileLine, index: number): string[] {
  const tile = getTileById(line.tileId);
  const info: string[] = [`Eilutė ${index + 1} · ${tile?.name ?? "—"}`];

  info.push(`Pjovimo storis: ${formatLineStoris(line)}`);

  if (tile) {
    info.push(
      `Matmenys: ${formatDimensions(tile.lengthMm, tile.widthMm, tile.heightMm)}`,
    );
    if (tile.supplier) info.push(`Tiekėjas: ${tile.supplier}`);
    if (tile.manufacturer) info.push(`Gamintojas: ${tile.manufacturer}`);
    if (tile.disc) info.push(`Diskas: ${tile.disc}`);
  }

  return info;
}

export function describeProductionLine(line: TileLine, index: number): string[] {
  const tile = getTileById(line.tileId);
  const info: string[] = [
    `Užsakymo eilutė ${index + 1}`,
    `Plytelė: ${tile?.name ?? "—"}`,
    `Pjovimo storis: ${formatLineStoris(line)}`,
  ];

  if (tile) {
    info.push(
      `Matmenys: ${formatDimensions(tile.lengthMm, tile.widthMm, tile.heightMm)}`,
    );
    if (tile.disc) info.push(`Diskas: ${tile.disc}`);
    if (tile.supplier) info.push(`Tiekėjas: ${tile.supplier}`);
    if (tile.hardness !== undefined) info.push(`Kietumas: ${tile.hardness}`);
    if (tile.fragilityStrip) info.push(`Brokas juostoje: ${tile.fragilityStrip}`);
    if (tile.fragilityCorner) info.push(`Brokas kampuose: ${tile.fragilityCorner}`);
  }

  info.push(`Kiekis: ${formatLineQuantity(line)}`);

  return info;
}

export function validateProposal(proposal: Proposal, catalog?: Tile[]): string[] {
  const errors: string[] = [];
  if (!proposal.client.trim()) errors.push("Nurodykite klientą.");
  if (!proposal.object.trim()) errors.push("Nurodykite objektą.");
  if (!proposal.number.trim()) errors.push("Nurodykite pasiūlymo numerį.");
  if (!proposal.validUntil) errors.push("Nurodykite galiojimo datą.");
  if (!proposal.serviceDeadline) errors.push("Nurodykite paslaugos terminą.");
  if (!proposal.pjovimas.trim()) errors.push("Pasirinkite barą (pjūvį).");
  if (proposal.tileLines.length === 0) {
    errors.push("Pridėkite bent vieną plytelių eilutę.");
  }

  const tileKnown = (tileId: string) =>
    Boolean(tileId) &&
    Boolean(
      catalog?.some((tile) => tile.id === tileId) || getTileById(tileId),
    );

  proposal.tileLines.forEach((line, index) => {
    if (!tileKnown(line.tileId)) {
      errors.push(`Eilutė ${index + 1}: pasirinkite plytelę.`);
    }
    if (line.quantity <= 0) {
      errors.push(`Eilutė ${index + 1}: kiekis turi būti didesnis už 0.`);
    }
  });

  return errors;
}
