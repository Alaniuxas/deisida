import type { MachineCode } from "@/lib/production-types";

export const DEFAULT_SHOP_CODES: Record<MachineCode, string> = {
  KONV: "sk1",
  KNEW: "sk2",
};

export function defaultShopCode(code: string): string {
  if (code === "KONV" || code === "KNEW") {
    return DEFAULT_SHOP_CODES[code];
  }

  return code.toLowerCase();
}

export function resolveShopCode(
  code: string,
  shopCode: string | null | undefined,
): string {
  if (shopCode?.trim()) {
    return shopCode.trim();
  }

  return defaultShopCode(code);
}
