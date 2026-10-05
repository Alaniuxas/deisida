/** Excel pjovimo norma — rodoma vnt./d. (ne paletės; planavimas skaičiuoja iš vnt./d.). */
export function formatPalletRateWithNorm(
  _palletsPerDay: number,
  piecesPerDay?: number | null,
): string {
  if (piecesPerDay != null && piecesPerDay > 0) {
    return `${piecesPerDay.toLocaleString("lt-LT")} vnt./d.`;
  }
  if (_palletsPerDay > 0) {
    return `${_palletsPerDay} pal./d. (legacy)`;
  }
  return "norma nenustatyta";
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
