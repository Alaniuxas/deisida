import { format } from "date-fns";
import { lt } from "date-fns/locale";
import type { PackagingOptions, Proposal, TileLine } from "./types";
import { PJUVIS_OPTIONS, defaultPackaging } from "./types";
import { getTileById } from "./tiles";

const TILE_FALLBACK_ID = "kolumba-k58";

export function generateProposalNumber(sequence = 2): string {
  const stamp = format(new Date(), "yyMMdd");
  return `DEI${stamp}-${sequence}`;
}

export function createEmptyTileLine(tileId?: string): TileLine {
  const tile = tileId ? getTileById(tileId) : undefined;
  return {
    id: crypto.randomUUID(),
    tileId: tile?.id ?? TILE_FALLBACK_ID,
    pjovimas: PJUVIS_OPTIONS[0],
    quantityPallets: 1,
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
    tileLines: [createEmptyTileLine("kolumba-k58")],
    extraClauses: [],
  };
}

export function formatLtDate(isoDate: string): string {
  if (!isoDate) return "—";
  try {
    return format(new Date(isoDate), "yyyy-MM-dd", { locale: lt });
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
    if (line.quantityPallets <= 0) {
      errors.push(`Eilutė ${index + 1}: kiekis turi būti didesnis už 0.`);
    }
    if (line.showStoris && line.storisMm <= 0) {
      errors.push(`Eilutė ${index + 1}: nurodykite storį.`);
    }
  });

  return errors;
}
