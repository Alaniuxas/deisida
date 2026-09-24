import { format, parseISO } from "date-fns";
import { lt } from "date-fns/locale";
import type { PackagingOptions, Proposal, QuantityUnit, TileLine } from "./types";
import { PJUVIS_OPTIONS, defaultPackaging } from "./types";
import { getTileById } from "./tiles";

const TILE_FALLBACK_ID = "kolumba-k58";
export const VAT_RATE = 0.21;

export function generateProposalNumber(sequence = 2): string {
  const stamp = format(new Date(), "yyMMdd");
  return `DEI${stamp}-${sequence}`;
}

export function createEmptyTileLine(tileId?: string, id?: string): TileLine {
  const tile = tileId ? getTileById(tileId) : undefined;
  return {
    id: id ?? `line-${crypto.randomUUID()}`,
    tileId: tile?.id ?? TILE_FALLBACK_ID,
    pjovimas: PJUVIS_OPTIONS[0],
    quantity: 1,
    quantityUnit: "pallets",
    storisMm: tile?.defaultStorisMm ?? 25,
    showStoris: true,
    comment: "",
    packaging: defaultPackaging(),
  };
}

export function createDefaultProposal(): Proposal {
  const today = new Date();
  const inMonth = new Date(today);
  inMonth.setDate(inMonth.getDate() + 30);

  return {
    number: generateProposalNumber(2),
    validUntil: format(inMonth, "yyyy-MM-dd"),
    serviceDeadline: format(inMonth, "yyyy-MM-dd"),
    client: "",
    object: "",
    comment: "",
    tileLines: [createEmptyTileLine("kolumba-k58", "line-1")],
    extraClauses: [],
  };
}

export function formatLtDate(isoDate: string): string {
  if (!isoDate) return "—";
  try {
    return format(parseISO(isoDate), "yyyy 'm.' MMMM d 'd.'", { locale: lt });
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

export function formatCatalogPrice(priceEur: number): string {
  if (priceEur <= 0) return "—";
  return new Intl.NumberFormat("lt-LT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(priceEur);
}

export function getLineCatalogPrice(line: TileLine): number {
  return getTileById(line.tileId)?.priceEur ?? 0;
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

export function getLineUnitPrice(line: TileLine): number {
  return getLineCatalogPrice(line);
}

export function getLineSubtotal(line: TileLine): number {
  return getLinePieceCount(line) * getLineUnitPrice(line);
}

export interface ProposalPricing {
  subtotal: number;
  vat: number;
  total: number;
}

export function getProposalPricing(proposal: Proposal): ProposalPricing {
  const subtotal = proposal.tileLines.reduce(
    (sum, line) => sum + getLineSubtotal(line),
    0,
  );
  const vat = subtotal * VAT_RATE;
  return { subtotal, vat, total: subtotal + vat };
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

export function describeLineSideInfo(line: TileLine, index: number): string[] {
  const tile = getTileById(line.tileId);
  const info: string[] = [`Eilutė ${index + 1} · ${tile?.name ?? "—"}`];

  if (line.showStoris) {
    info.push(`Storis: ${line.storisMm} mm`);
  }

  if (tile) {
    info.push(
      `Matmenys: ${formatDimensions(tile.lengthMm, tile.widthMm, tile.heightMm)}`,
    );
    if (tile.supplier) info.push(`Tiekėjas: ${tile.supplier}`);
    if (tile.manufacturer) info.push(`Gamintojas: ${tile.manufacturer}`);
    if (tile.disc) info.push(`Diskas: ${tile.disc}`);
  }

  info.push(...describePackagingChoices(line.packaging));

  if (line.comment.trim()) {
    info.push(`Komentaras: ${line.comment.trim()}`);
  }

  return info;
}

export function describeProductionLine(line: TileLine, index: number): string[] {
  const tile = getTileById(line.tileId);
  const info: string[] = [
    `Užsakymo eilutė ${index + 1}`,
    `Plytelė: ${tile?.name ?? "—"}`,
    `Baras: ${line.pjovimas}`,
    `Pjovimo storis: ${line.showStoris ? `${line.storisMm} mm` : "—"}`,
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
  info.push(...describePackagingChoices(line.packaging));

  return info;
}

export function validateProposal(proposal: Proposal): string[] {
  const errors: string[] = [];
  if (!proposal.client.trim()) errors.push("Nurodykite klientą.");
  if (!proposal.object.trim()) errors.push("Nurodykite objektą.");
  if (!proposal.number.trim()) errors.push("Nurodykite pasiūlymo numerį.");
  if (!proposal.validUntil) errors.push("Nurodykite galiojimo datą.");
  if (!proposal.serviceDeadline) errors.push("Nurodykite paslaugos terminą.");
  if (proposal.tileLines.length === 0) {
    errors.push("Pridėkite bent vieną plytelių eilutę.");
  }

  proposal.tileLines.forEach((line, index) => {
    if (!getTileById(line.tileId)) {
      errors.push(`Eilutė ${index + 1}: pasirinkite plytelę.`);
    }
    if (!line.pjovimas.trim()) {
      errors.push(`Eilutė ${index + 1}: pasirinkite pjūvį.`);
    }
    if (line.quantity <= 0) {
      errors.push(`Eilutė ${index + 1}: kiekis turi būti didesnis už 0.`);
    }
    if (line.showStoris && line.storisMm <= 0) {
      errors.push(`Eilutė ${index + 1}: nurodykite storį.`);
    }
  });

  return errors;
}
