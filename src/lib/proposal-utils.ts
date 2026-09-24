import { format } from "date-fns";
import { lt } from "date-fns/locale";
import type { PackagingOptions, Proposal, TileLine } from "./types";
import { defaultPackaging } from "./types";
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
    if (line.quantityPallets <= 0) {
      errors.push(`Eilutė ${index + 1}: kiekis turi būti didesnis už 0.`);
    }
    if (line.showStoris && line.storisMm <= 0) {
      errors.push(`Eilutė ${index + 1}: nurodykite storį.`);
    }
  });

  return errors;
}
