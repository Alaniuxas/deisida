import { describe, expect, it } from "vitest";
import {
  capSeedPieces,
  isShopWidth,
  pickDiverseArchiveOrders,
  pickSpreadWidths,
  remapArchiveDeadlines,
} from "./archive-queue-sample";

describe("archive-queue-sample", () => {
  it("keeps conveyor widths and drops slab sizes", () => {
    expect(isShopWidth(100)).toBe(true);
    expect(isShopWidth(10)).toBe(true);
    expect(isShopWidth(200)).toBe(true);
    expect(isShopWidth(600)).toBe(false);
    expect(isShopWidth(9)).toBe(false);
  });

  it("does not flatten large and small jobs to the same band", () => {
    expect(capSeedPieces(450)).toBe(450);
    expect(capSeedPieces(12_000)).toBe(8_000);
  });

  it("preserves relative deadline order when shifting into the locked week", () => {
    const mapped = remapArchiveDeadlines(
      ["2025-03-01", "2025-06-01", "2026-10-01"],
      "2026-10-05",
      { windowStartDays: 2, windowLengthDays: 18 },
    );
    expect(mapped[0] < mapped[1] && mapped[1] < mapped[2]).toBe(true);
    expect(mapped[0]).toBe("2026-10-07");
    expect(mapped[2]).toBe("2026-10-25");
  });

  it("keeps same-day archive batches on the same mapped day", () => {
    const mapped = remapArchiveDeadlines(
      ["2026-04-10", "2026-04-10", "2026-04-10"],
      "2026-10-05",
    );
    expect(new Set(mapped).size).toBe(1);
  });

  it("spreads machine magnets instead of clustering 100/101/102", () => {
    const widths = [
      ...Array(40).fill(100),
      ...Array(20).fill(102),
      ...Array(15).fill(101),
      ...Array(12).fill(65),
      ...Array(10).fill(115),
      ...Array(8).fill(50),
      ...Array(6).fill(132),
    ];
    const magnets = pickSpreadWidths(widths, 6, 12);
    expect(magnets).toContain(100);
    expect(magnets).toContain(65);
    expect(new Set(magnets).size).toBe(6);
    expect(Math.max(...magnets) - Math.min(...magnets)).toBeGreaterThanOrEqual(50);
    const spreadCore = magnets.filter((widthMm) => widthMm !== 101 && widthMm !== 102);
    expect(spreadCore.length).toBeGreaterThanOrEqual(4);
  });

  it("caps 100 mm orders so other archive widths remain in the sample", () => {
    const candidates = [
      ...Array.from({ length: 30 }, (_, index) => ({
        number: `W100-${index}`,
        deadline: "2026-09-01",
        lines: [{ widthMm: 100 }],
      })),
      {
        number: "W65",
        deadline: "2026-08-01",
        lines: [{ widthMm: 65 }],
      },
      {
        number: "W115",
        deadline: "2026-07-01",
        lines: [{ widthMm: 115 }],
      },
    ];
    const picked = pickDiverseArchiveOrders(candidates, 12, 8);
    const widths = picked.flatMap((item) => item.lines.map((line) => line.widthMm));
    expect(widths.filter((widthMm) => widthMm === 100).length).toBe(8);
    expect(widths).toContain(65);
    expect(widths).toContain(115);
  });
});
