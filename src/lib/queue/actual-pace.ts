import { SHIFT_HOURS } from "./constants";

export interface PalletLogEntry {
  goodQuantity: number;
  defectQuantity: number;
  loggedAt: string;
}

export interface PaceEstimate {
  piecesPerHour: number;
  source: "norm" | "actual";
  sampleCount: number;
}

const MIN_PACE_SAMPLES = 2;

export function expectedPiecesPerPallet(
  pieceCount: number,
  quantityPallets: number,
): number {
  if (quantityPallets <= 0) return pieceCount;
  return Math.max(1, Math.round(pieceCount / quantityPallets));
}

export function estimatePiecesPerHourFromLogs(
  logs: PalletLogEntry[],
  normPiecesPerDay: number,
): PaceEstimate {
  if (logs.length < MIN_PACE_SAMPLES) {
    return {
      piecesPerHour: normPiecesPerDay > 0 ? normPiecesPerDay / SHIFT_HOURS : 0,
      source: "norm",
      sampleCount: logs.length,
    };
  }

  const sorted = [...logs].sort(
    (left, right) => new Date(left.loggedAt).getTime() - new Date(right.loggedAt).getTime(),
  );
  let totalPieces = 0;
  let totalHours = 0;
  for (let index = 1; index < sorted.length; index += 1) {
    const prev = sorted[index - 1];
    const current = sorted[index];
    const hours =
      (new Date(current.loggedAt).getTime() - new Date(prev.loggedAt).getTime()) /
      (60 * 60 * 1000);
    if (hours <= 0 || hours > 24) continue;
    totalPieces += current.goodQuantity;
    totalHours += hours;
  }

  if (totalHours <= 0 || totalPieces <= 0) {
    return {
      piecesPerHour: normPiecesPerDay > 0 ? normPiecesPerDay / SHIFT_HOURS : 0,
      source: "norm",
      sampleCount: logs.length,
    };
  }

  return {
    piecesPerHour: totalPieces / totalHours,
    source: "actual",
    sampleCount: logs.length,
  };
}

export function remainingProductionHours(
  remainingPieces: number,
  pace: PaceEstimate,
): number {
  if (pace.piecesPerHour <= 0) return 0;
  return remainingPieces / pace.piecesPerHour;
}

export function requiresUnderPlanComment(
  goodQuantity: number,
  expectedQuantity: number,
): boolean {
  if (expectedQuantity <= 0) return false;
  return goodQuantity < expectedQuantity * 0.9;
}
