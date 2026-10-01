import { SHOP_MACHINE_ORDER } from "./constants";

/** Shop-floor label; Excel codes (NK1/NK2/S1/…) win over internal ids. */
export function resolveShopCode(
  code: string,
  shopCode: string | null | undefined,
): string {
  if (shopCode?.trim()) {
    return shopCode.trim();
  }
  return code;
}

export function isMachineCode(value: string): boolean {
  return value.trim().length > 0;
}

export function sortShopCodes(codes: string[]): string[] {
  return [...codes].sort((left, right) => {
    const leftIndex = (SHOP_MACHINE_ORDER as readonly string[]).indexOf(left);
    const rightIndex = (SHOP_MACHINE_ORDER as readonly string[]).indexOf(right);
    const leftRank = leftIndex === -1 ? 99 : leftIndex;
    const rightRank = rightIndex === -1 ? 99 : rightIndex;
    if (leftRank !== rightRank) return leftRank - rightRank;
    return left.localeCompare(right);
  });
}
