import { addCalendarDays } from "./week";

/** Shop cutting range — archive also has 400/600 mm slabs that are not conveyor jobs. */
export const SHOP_MIN_WIDTH_MM = 10;
export const SHOP_MAX_WIDTH_MM = 200;
export const MAGNET_MIN_GAP_MM = 12;
export const MAX_SEED_PIECES = 8_000;
export const MAX_ORDERS_PER_WIDTH = 8;
export const MAX_ARCHIVE_LINES = 4;
export const FALLBACK_MAGNET_WIDTHS_MM = [65, 90, 100, 115, 120, 140];

export function isShopWidth(widthMm: number): boolean {
  return (
    Number.isFinite(widthMm) &&
    widthMm >= SHOP_MIN_WIDTH_MM &&
    widthMm <= SHOP_MAX_WIDTH_MM
  );
}

export function capSeedPieces(pieces: number): number {
  if (!Number.isFinite(pieces) || pieces <= 0) {
    return 400;
  }
  return Math.min(Math.round(pieces), MAX_SEED_PIECES);
}

/**
 * Maps historical deadlines into the current locked-week window.
 * Keeps relative order and clustering (same original day → same mapped day).
 */
export function remapArchiveDeadlines(
  originalIsos: string[],
  weekStartIso: string,
  options?: { windowStartDays?: number; windowLengthDays?: number },
): string[] {
  const windowStartDays = options?.windowStartDays ?? 2;
  const windowLengthDays = options?.windowLengthDays ?? 18;

  const parsed = originalIsos.map((iso) => {
    const time = Date.parse(iso);
    return Number.isFinite(time) ? time : null;
  });
  const valid = parsed.filter((time): time is number => time != null);

  if (valid.length === 0) {
    return originalIsos.map((_, index) =>
      addCalendarDays(
        weekStartIso,
        windowStartDays + (index % (windowLengthDays + 1)),
      ),
    );
  }

  const min = Math.min(...valid);
  const max = Math.max(...valid);
  const span = Math.max(max - min, 1);

  return parsed.map((time, index) => {
    const source =
      time ?? min + (index / Math.max(originalIsos.length - 1, 1)) * span;
    const ratio = (source - min) / span;
    const days = windowStartDays + Math.round(ratio * windowLengthDays);
    return addCalendarDays(weekStartIso, days);
  });
}

/** Pick up to `limit` widths that are spread apart, ranked by frequency. */
export function pickSpreadWidths(
  widths: number[],
  limit: number,
  minGapMm = MAGNET_MIN_GAP_MM,
): number[] {
  const counts = new Map<number, number>();
  for (const widthMm of widths) {
    if (!isShopWidth(widthMm)) continue;
    counts.set(widthMm, (counts.get(widthMm) ?? 0) + 1);
  }

  const ranked = [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0] - right[0])
    .map(([widthMm]) => widthMm);

  const picked: number[] = [];
  const fitsGap = (candidate: number) =>
    picked.every((widthMm) => Math.abs(widthMm - candidate) >= minGapMm);

  for (const widthMm of ranked) {
    if (fitsGap(widthMm)) {
      picked.push(widthMm);
      if (picked.length >= limit) return picked;
    }
  }

  for (const fallback of FALLBACK_MAGNET_WIDTHS_MM) {
    if (picked.length >= limit) break;
    if (!picked.includes(fallback) && fitsGap(fallback)) {
      picked.push(fallback);
    }
  }

  for (const widthMm of [...ranked, ...FALLBACK_MAGNET_WIDTHS_MM]) {
    if (picked.length >= limit) break;
    if (!picked.includes(widthMm)) {
      picked.push(widthMm);
    }
  }

  return picked.slice(0, limit);
}

export interface WidthedOrder {
  number: string;
  deadline: string;
  lines: { widthMm: number }[];
}

/** Diverse real archive mix: new widths first, cap per width so 100 mm does not dominate. */
export function pickDiverseArchiveOrders<T extends WidthedOrder>(
  candidates: T[],
  limit: number,
  maxPerWidth = MAX_ORDERS_PER_WIDTH,
): T[] {
  const selected: T[] = [];
  const used = new Set<string>();
  const widthCounts = new Map<number, number>();
  const seenWidths = new Set<number>();

  const score = (item: T): number => {
    const widths = item.lines.map((line) => line.widthMm);
    if (widths.some((widthMm) => (widthCounts.get(widthMm) ?? 0) >= maxPerWidth)) {
      return Number.NEGATIVE_INFINITY;
    }
    const novelty = widths.filter((widthMm) => !seenWidths.has(widthMm)).length;
    const spread = new Set(widths).size;
    const year = Number.parseInt(item.deadline.slice(0, 4), 10) || 0;
    const recency = year >= 2026 ? 4 : year >= 2025 ? 2 : 0;
    return novelty * 20 + spread * 3 + recency;
  };

  while (selected.length < limit && used.size < candidates.length) {
    let best: T | null = null;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (const candidate of candidates) {
      if (used.has(candidate.number)) continue;
      const next = score(candidate);
      if (next > bestScore) {
        best = candidate;
        bestScore = next;
      }
    }
    if (!best || !Number.isFinite(bestScore)) break;
    used.add(best.number);
    selected.push(best);
    for (const line of best.lines) {
      seenWidths.add(line.widthMm);
      widthCounts.set(line.widthMm, (widthCounts.get(line.widthMm) ?? 0) + 1);
    }
  }

  return selected;
}
