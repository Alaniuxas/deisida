import { describe, expect, it } from "vitest";
import { normalizeArchivePieces } from "./archive-quantities";

describe("normalizeArchivePieces", () => {
  it("treats small archive counts as pallets when qpp is known", () => {
    expect(normalizeArchivePieces(5, 374)).toBe(5 * 374);
    expect(normalizeArchivePieces(1, 374)).toBe(400); // min 400 vnt.
  });

  it("uses assumed qpp when tile has no pallet size", () => {
    expect(normalizeArchivePieces(5, 0)).toBe(5 * 500);
    expect(normalizeArchivePieces(1, 0)).toBe(500);
  });

  it("leaves large piece counts unchanged", () => {
    expect(normalizeArchivePieces(4328, 374)).toBe(4328);
  });
});
