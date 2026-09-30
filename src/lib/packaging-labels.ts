import type { JobPackaging } from "@/lib/production-types";

const PACKAGING_LABELS: Record<string, string> = {
  packOnlyIntact: "Pakuoti tik sveikas",
  packTwoParts: "Pakuoti dviem dalimis",
  packMoreThanTwoParts: "Pakuoti daugiau nei dviem dalimis",
  needLeftovers: "Reikia likučių",
  baseProtection: "Pagrindo apsauga",
  bottomInterlayer: "Tarpinė apačioje",
  rowInterlayer: "Tarpinė eilutėse",
};

export function formatPackagingLines(packaging: JobPackaging): string[] {
  if (packaging.summary?.length) {
    return packaging.summary;
  }

  const lines: string[] = [];

  for (const [key, label] of Object.entries(PACKAGING_LABELS)) {
    const value = packaging[key as keyof JobPackaging];
    if (value === true) {
      lines.push(label);
    }
  }

  if (lines.length === 0) {
    return ["Pakavimas nenurodytas"];
  }

  return lines;
}
