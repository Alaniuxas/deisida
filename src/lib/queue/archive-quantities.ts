/** Archyvo work-items dažnai saugo palečių sk., ne vnt. */
export const ARCHIVE_PALLET_COUNT_THRESHOLD = 25;
export const MIN_PRODUCTION_PIECES = 400;
export const ASSUMED_PIECES_PER_PALLET = 500;

export function normalizeArchivePieces(
  rawQuantity: number,
  quantityPerPallet: number,
): number {
  if (!Number.isFinite(rawQuantity) || rawQuantity <= 0) {
    return MIN_PRODUCTION_PIECES;
  }

  let pieces = Math.round(rawQuantity);

  if (pieces <= ARCHIVE_PALLET_COUNT_THRESHOLD) {
    const qpp =
      quantityPerPallet > 0 ? quantityPerPallet : ASSUMED_PIECES_PER_PALLET;
    pieces = Math.round(rawQuantity * qpp);
  }

  return Math.max(pieces, MIN_PRODUCTION_PIECES);
}
