import { describe, expect, it } from "vitest";
import {
  estimatePiecesPerHourFromLogs,
  expectedPiecesPerPallet,
  requiresUnderPlanComment,
  remainingProductionHours,
} from "./actual-pace";

describe("actual-pace", () => {
  it("computes expected pieces per pallet", () => {
    expect(expectedPiecesPerPallet(2400, 10)).toBe(240);
  });

  it("requires comment when under 90% of expected", () => {
    expect(requiresUnderPlanComment(80, 100)).toBe(true);
    expect(requiresUnderPlanComment(90, 100)).toBe(false);
  });

  it("uses norm pace with fewer than two samples", () => {
    const pace = estimatePiecesPerHourFromLogs(
      [{ goodQuantity: 200, defectQuantity: 0, loggedAt: "2026-10-06T10:00:00.000Z" }],
      2400,
    );
    expect(pace.source).toBe("norm");
  });

  it("uses actual pace from consecutive logs", () => {
    const pace = estimatePiecesPerHourFromLogs(
      [
        { goodQuantity: 100, defectQuantity: 0, loggedAt: "2026-10-06T08:00:00.000Z" },
        { goodQuantity: 120, defectQuantity: 0, loggedAt: "2026-10-06T10:00:00.000Z" },
      ],
      2400,
    );
    expect(pace.source).toBe("actual");
    expect(pace.piecesPerHour).toBe(60);
    expect(remainingProductionHours(600, pace)).toBe(10);
  });
});
