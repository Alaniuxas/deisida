import type { JobPackaging } from "@/lib/production-types";

function triStateLabel(value: boolean | null | undefined): string {
  if (value === true) return "Taip";
  if (value === false) return "Ne";
  return "Nenurodyta";
}

export function formatPackagingLines(packaging: JobPackaging): string[] {
  if (packaging.summary?.length) {
    return packaging.summary;
  }

  const lines: string[] = [
    `Pakuoti tik neskilusi: ${triStateLabel(packaging.packOnlyIntact)}`,
    `Pakuoti į 2 dalis skilusi: ${triStateLabel(packaging.packTwoParts)}`,
    `Pakuoti daugiau nei į 2 dalis (dūžiai): ${triStateLabel(packaging.packMoreThanTwoParts)}`,
    `Viduriukai (likučiai): ${triStateLabel(packaging.needLeftovers)}`,
  ];

  if (packaging.baseProtection) lines.push("Bazinė apsauga");
  if (packaging.bottomInterlayer) lines.push("Apatinis perklojimas");
  if (packaging.rowInterlayer) lines.push("Kiekvienos eilės perklojimas");

  return lines;
}
