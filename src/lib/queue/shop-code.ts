import type { MachineCode } from "@/lib/production-types";

/** Optional cecho label; falls back to internal machine code (KONV/KNEW). */
export function resolveShopCode(
  code: string,
  shopCode: string | null | undefined,
): string {
  if (shopCode?.trim()) {
    return shopCode.trim();
  }

  return code;
}

export function isMachineCode(value: string): value is MachineCode {
  return value === "KONV" || value === "KNEW";
}
