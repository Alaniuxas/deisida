export type KonvejeriaiTab = "rotacijos" | "konvejeriai" | "istorija";

export function resolveKonvejeriaiTab(
  value: string | null | undefined,
): KonvejeriaiTab {
  if (value === "konvejeriai" || value === "istorija" || value === "rotacijos") {
    return value;
  }
  return "konvejeriai";
}
