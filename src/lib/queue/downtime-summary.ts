import type { DowntimeMove } from "./downtime-redistribute";

export interface DowntimeMoveSummaryLine {
  fromMachineCode: string;
  toMachineCode: string;
  count: number;
  widthSamples: number[];
}

export function summarizeDowntimeMoves(moves: DowntimeMove[]): DowntimeMoveSummaryLine[] {
  const buckets = new Map<string, DowntimeMoveSummaryLine>();
  for (const move of moves) {
    const key = `${move.fromMachineCode}→${move.toMachineCode}`;
    const existing = buckets.get(key);
    if (existing) {
      existing.count += 1;
      if (existing.widthSamples.length < 4) {
        existing.widthSamples.push(move.jobWidthMm);
      }
      continue;
    }
    buckets.set(key, {
      fromMachineCode: move.fromMachineCode,
      toMachineCode: move.toMachineCode,
      count: 1,
      widthSamples: [move.jobWidthMm],
    });
  }
  return [...buckets.values()].sort(
    (left, right) =>
      right.count - left.count ||
      left.toMachineCode.localeCompare(right.toMachineCode),
  );
}

function formatWidthSamples(widths: number[]): string {
  if (widths.length === 0) return "";
  const unique = [...new Set(widths)].sort((left, right) => left - right);
  if (unique.length <= 3) {
    return unique.map((width) => `${width} mm`).join(", ");
  }
  return `${unique.slice(0, 3).join(", ")} mm…`;
}

/** Short Lithuanian notice for UI banner. */
export function formatDowntimeNotice(
  moves: DowntimeMove[],
  options?: { confirmedLateCount?: number; manualJobCount?: number },
): string {
  let notice: string;
  if (moves.length === 0) {
    notice = "Gedimas užregistruotas — planas perskaičiuotas.";
  } else {
    const lines = summarizeDowntimeMoves(moves);
    const detail = lines
      .map((line) => {
        const widths = formatWidthSamples(line.widthSamples);
        const widthPart = widths ? ` (${widths})` : "";
        return `${line.fromMachineCode}→${line.toMachineCode}: ${line.count}${widthPart}`;
      })
      .join("; ");

    notice = `Gedimas užregistruotas — perkelta ${moves.length} darb.: ${detail}`;
  }

  const lateCount = options?.confirmedLateCount ?? 0;
  if (lateCount > 0) {
    notice += ` · ${lateCount} užsak. bus supjauta po termino (patvirtinta).`;
  }
  const manualCount = options?.manualJobCount ?? 0;
  if (manualCount > 0) {
    notice += ` · ${manualCount} užsak. palikta ${manualCount === 1 ? "staklėje" : "staklėse"} — perkelkite rankiniu būdu.`;
  }
  return notice;
}
