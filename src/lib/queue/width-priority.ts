import {
  CHANGEOVER_ASSIGN_MAX_GAP_MM,
  WIDTH_SETUP_TOLERANCE_MM,
} from "./machine-width";

export type WidthStepBand = 0 | 1 | 2;

export function widthGapAbs(setupWidthMm: number, jobWidthMm: number): number {
  if (setupWidthMm <= 0) {
    return 0;
  }
  return Math.abs(setupWidthMm - jobWidthMm);
}

/** 0 = ±5 mm, 1 = 6–15 mm, 2 = any wider step. Not a ban — only priority. */
export function widthStepBand(
  setupWidthMm: number,
  jobWidthMm: number,
): WidthStepBand {
  const gap = widthGapAbs(setupWidthMm, jobWidthMm);
  if (setupWidthMm <= 0) {
    return 0;
  }
  if (gap <= WIDTH_SETUP_TOLERANCE_MM) {
    return 0;
  }
  if (gap <= CHANGEOVER_ASSIGN_MAX_GAP_MM) {
    return 1;
  }
  return 2;
}

export function isDeadlineUrgent(
  deadline: Date | string,
  weekEndIso: string,
): boolean {
  const iso =
    deadline instanceof Date
      ? deadline.toISOString().slice(0, 10)
      : String(deadline).slice(0, 10);
  return iso <= weekEndIso;
}

export interface WidthDeadlineSortKey {
  urgent: boolean;
  band: WidthStepBand;
  gap: number;
  deadlineMs: number;
}

/**
 * Idle-fill / leftover pick: urgent deadline first, then smallest mm step
 * (±5, then ≤15, then any width). Inside the wide band, deadline then gap.
 */
export function compareWidthDeadlinePriority(
  left: WidthDeadlineSortKey,
  right: WidthDeadlineSortKey,
): number {
  if (left.urgent !== right.urgent) {
    return left.urgent ? -1 : 1;
  }
  if (left.band !== right.band) {
    return left.band - right.band;
  }
  if (left.band >= 2) {
    if (left.deadlineMs !== right.deadlineMs) {
      return left.deadlineMs - right.deadlineMs;
    }
    return left.gap - right.gap;
  }
  if (left.gap !== right.gap) {
    return left.gap - right.gap;
  }
  return left.deadlineMs - right.deadlineMs;
}
