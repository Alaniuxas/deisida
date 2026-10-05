import { describe, expect, it } from "vitest";
import { buildLaneWidthSegments } from "./lane-segments";
import type { QueueJob } from "@/lib/production-types";

function job(id: string, widthMm: number, requiresChangeover = false): QueueJob {
  return {
    id,
    tileName: id,
    client: "Klientas",
    object: "",
    deadline: "2026-10-15",
    storisMm: 40,
    widthMm,
    quantityPlanned: 100,
    quantityUnit: "pieces",
    schedule: {
      widthMm,
      storisMm: 40,
      deadline: "2026-10-15",
      conveyorCode: "S4",
      conveyorShopCode: "S4",
      conveyorName: "S4",
      machineCurrentWidthMm: 115,
      dailyRatePallets: 240,
      rotationHours: 4,
      changeoverMinutes: 30,
      quantityPallets: 1,
      productionHours: 8,
      changeoverHours: requiresChangeover ? 0.5 : 0,
      durationHours: requiresChangeover ? 8.5 : 8,
      estimatedStart: "2026-10-06T06:00:00.000Z",
      productionStart: requiresChangeover
        ? "2026-10-06T06:30:00.000Z"
        : "2026-10-06T06:00:00.000Z",
      estimatedEnd: "2026-10-06T14:00:00.000Z",
      positionInQueue: 1,
      requiresChangeover,
      assignmentReason: "",
      editable: true,
    },
  };
}

describe("buildLaneWidthSegments", () => {
  it("groups same-width jobs without changeover when within admin tolerance", () => {
    const segments = buildLaneWidthSegments(
      [
        job("a", 115),
        job("b", 115),
        job("c", 113),
        job("d", 113),
      ],
      115,
      30,
    );

    expect(segments).toHaveLength(2);
    expect(segments[0]?.widthMm).toBe(115);
    expect(segments[0]?.jobs).toHaveLength(2);
    expect(segments[0]?.requiresChangeover).toBe(false);
    expect(segments[1]?.widthMm).toBe(113);
    expect(segments[1]?.requiresChangeover).toBe(false);
    expect(segments[1]?.fromWidthMm).toBe(115);
  });

  it("requires changeover when job is outside admin setup tolerance", () => {
    const segments = buildLaneWidthSegments([job("a", 121, true)], 115, 30);

    expect(segments[0]?.requiresChangeover).toBe(true);
    expect(segments[0]?.fromWidthMm).toBe(115);
  });

  it("NK1@65: one changeover to 55; 52 and 51 without blocks", () => {
    const segments = buildLaneWidthSegments(
      [60, 55, 52, 51].map((width, index) => job(`j${index}`, width)),
      65,
      30,
    );

    const withChangeover = segments.filter((segment) => segment.requiresChangeover);
    expect(withChangeover).toHaveLength(1);
    expect(withChangeover[0]?.fromWidthMm).toBe(65);
    expect(withChangeover[0]?.widthMm).toBe(55);
    expect(segments.find((segment) => segment.widthMm === 52)?.requiresChangeover).toBe(
      false,
    );
    expect(segments.find((segment) => segment.widthMm === 51)?.requiresChangeover).toBe(
      false,
    );
  });
});
