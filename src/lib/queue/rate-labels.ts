export function formatPalletRateWithNorm(
  palletsPerDay: number,
  piecesPerDay?: number | null,
): string {
  const pallets = `${palletsPerDay} pal./d.`;
  if (piecesPerDay != null && piecesPerDay > 0) {
    return `${pallets} · ${piecesPerDay.toLocaleString("lt-LT")} vnt./d.`;
  }
  return pallets;
}

export function conveyorDisplayLabel(
  code: string,
  name?: string | null,
): string {
  if (name?.trim()) {
    return `${code} — ${name.trim()}`;
  }
  return code;
}
