import { describe, expect, it } from "vitest";
import { CHANGEOVER_ASSIGN_MAX_GAP_MM } from "./machine-width";
import { suggestMoveTargets } from "./suggest-move";

describe("suggestMoveTargets", () => {
  it("recommends machine with matching width that meets deadline", () => {
    const machines = [
      {
        id: "nk1",
        code: "NK1",
        currentWidthMm: 65,
        dailyRatePieces: 240,
        piecesPerDay: 2000,
      },
      {
        id: "s4",
        code: "S4",
        currentWidthMm: 55,
        dailyRatePieces: 240,
        piecesPerDay: 2000,
      },
    ];

    const laneJobsByMachine = new Map([
      [
        "s4",
        [
          {
            jobId: "other",
            widthMm: 55,
            pieceCount: 500,
            quantityPallets: 1,
            estimatedStart: new Date("2026-10-06T05:00:00.000Z"),
            estimatedEnd: new Date("2026-10-06T10:00:00.000Z"),
          },
        ],
      ],
    ]);

    const suggestions = suggestMoveTargets({
      movingJob: {
        jobId: "move-me",
        widthMm: 55,
        pieceCount: 400,
        quantityPallets: 1,
        fromMachineId: "nk1",
      },
      cutByIso: "2026-10-15T17:00:00",
      machines,
      laneJobsByMachine,
    });

    const recommended = suggestions.find((row) => row.recommended);
    expect(recommended?.machineCode).toBe("S4");
    expect(recommended?.eligible).toBe(true);
    expect(suggestions.every((row) => row.eligible)).toBe(true);
  });

  it("labels changeover with CHANGEOVER_ASSIGN_MAX_GAP_MM bands", () => {
    const machines = [
      {
        id: "nk1",
        code: "NK1",
        currentWidthMm: 65,
        dailyRatePieces: 240,
        piecesPerDay: 2000,
      },
      {
        id: "sk1",
        code: "SK1",
        currentWidthMm: 100,
        dailyRatePieces: 240,
        piecesPerDay: 2000,
      },
    ];

    const suggestions = suggestMoveTargets({
      movingJob: {
        jobId: "move-me",
        widthMm: 55,
        pieceCount: 400,
        quantityPallets: 1,
        fromMachineId: "s4",
      },
      cutByIso: "2026-10-15T17:00:00",
      machines,
      laneJobsByMachine: new Map(),
    });

    const near = suggestions.find((row) => row.machineCode === "NK1");
    const far = suggestions.find((row) => row.machineCode === "SK1");
    expect(near?.reason).toContain(`≤${CHANGEOVER_ASSIGN_MAX_GAP_MM} mm`);
    expect(far?.reason).toContain(`>${CHANGEOVER_ASSIGN_MAX_GAP_MM} mm`);
  });

  it("prefers a no-changeover slot later in the queue over front insert", () => {
    const machines = [
      {
        id: "nk1",
        code: "NK1",
        currentWidthMm: 65,
        dailyRatePieces: 240,
        piecesPerDay: 2000,
      },
    ];

    const laneJobsByMachine = new Map([
      [
        "nk1",
        [
          {
            jobId: "first-65",
            widthMm: 65,
            pieceCount: 200,
            quantityPallets: 1,
            estimatedStart: new Date("2026-10-06T05:00:00.000Z"),
            estimatedEnd: new Date("2026-10-06T12:00:00.000Z"),
          },
          {
            jobId: "later-90",
            widthMm: 90,
            pieceCount: 200,
            quantityPallets: 1,
            estimatedStart: new Date("2026-10-07T05:00:00.000Z"),
            estimatedEnd: new Date("2026-10-07T12:00:00.000Z"),
          },
        ],
      ],
    ]);

    const suggestions = suggestMoveTargets({
      movingJob: {
        jobId: "move-90",
        widthMm: 90,
        pieceCount: 200,
        quantityPallets: 1,
        fromMachineId: "nk1",
      },
      cutByIso: "2026-10-09T17:00:00+03:00",
      machines,
      laneJobsByMachine,
    });

    const recommended = suggestions.find((row) => row.recommended);
    expect(recommended?.requiresChangeover).toBe(false);
    expect(recommended?.meetsDeadline).toBe(true);
    const finish = recommended?.estimatedFinishIso
      ? new Date(recommended.estimatedFinishIso)
      : null;
    expect(finish?.getTime()).toBeGreaterThan(
      new Date("2026-10-06T12:00:00.000Z").getTime(),
    );
  });

  it("does not favor current machine id — compares simulated slot gaps", () => {
    const machines = [
      {
        id: "nk1",
        code: "NK1",
        currentWidthMm: 65,
        dailyRatePieces: 240,
        piecesPerDay: 2000,
      },
      {
        id: "s4",
        code: "S4",
        currentWidthMm: 55,
        dailyRatePieces: 240,
        piecesPerDay: 2000,
      },
    ];

    const laneJobsByMachine = new Map([
      [
        "nk1",
        [
          {
            jobId: "nk1-blocker",
            widthMm: 65,
            pieceCount: 4000,
            quantityPallets: 1,
            estimatedStart: new Date("2026-10-06T05:00:00.000Z"),
            estimatedEnd: new Date("2026-10-12T12:00:00.000Z"),
          },
        ],
      ],
      [
        "s4",
        [
          {
            jobId: "s4-100",
            widthMm: 100,
            pieceCount: 200,
            quantityPallets: 1,
            estimatedStart: new Date("2026-10-06T05:00:00.000Z"),
            estimatedEnd: new Date("2026-10-06T12:00:00.000Z"),
          },
        ],
      ],
    ]);

    const suggestions = suggestMoveTargets({
      movingJob: {
        jobId: "move-101",
        widthMm: 101,
        pieceCount: 800,
        quantityPallets: 1,
        fromMachineId: "nk1",
      },
      cutByIso: "2026-10-15T17:00:00+03:00",
      machines,
      laneJobsByMachine,
    });

    const recommended = suggestions.find((row) => row.recommended);
    expect(recommended?.machineCode).toBe("S4");
    expect(recommended?.requiresChangeover).toBe(false);
  });

  it("uses projected setup from queue walk, not only admin magnet", () => {
    const machines = [
      {
        id: "nk1",
        code: "NK1",
        currentWidthMm: 65,
        dailyRatePieces: 240,
        piecesPerDay: 2000,
      },
    ];

    const laneJobsByMachine = new Map([
      [
        "nk1",
        [
          {
            jobId: "setup-90",
            widthMm: 90,
            pieceCount: 200,
            quantityPallets: 1,
            estimatedStart: new Date("2026-10-06T05:00:00.000Z"),
            estimatedEnd: new Date("2026-10-06T12:00:00.000Z"),
          },
        ],
      ],
    ]);

    const suggestions = suggestMoveTargets({
      movingJob: {
        jobId: "move-90",
        widthMm: 90,
        pieceCount: 200,
        quantityPallets: 1,
        fromMachineId: "nk1",
      },
      cutByIso: "2026-11-30T17:00:00+03:00",
      machines,
      laneJobsByMachine,
    });

    const recommended = suggestions.find((row) => row.recommended);
    expect(recommended?.reason).toContain("Projektuojamas setup 90 mm");
    expect(recommended?.requiresChangeover).toBe(false);
  });

  it("with loose deadline prefers finish closer to cut-by, not earliest slot", () => {
    const machines = [
      {
        id: "nk1",
        code: "NK1",
        currentWidthMm: 65,
        dailyRatePieces: 240,
        piecesPerDay: 2000,
      },
    ];

    const laneJobsByMachine = new Map([
      [
        "nk1",
        [
          {
            jobId: "job-a",
            widthMm: 65,
            pieceCount: 200,
            quantityPallets: 1,
            estimatedStart: new Date("2026-10-06T05:00:00.000Z"),
            estimatedEnd: new Date("2026-10-06T12:00:00.000Z"),
          },
          {
            jobId: "job-b",
            widthMm: 65,
            pieceCount: 200,
            quantityPallets: 1,
            estimatedStart: new Date("2026-10-08T05:00:00.000Z"),
            estimatedEnd: new Date("2026-10-08T12:00:00.000Z"),
          },
        ],
      ],
    ]);

    const suggestions = suggestMoveTargets({
      movingJob: {
        jobId: "move-65",
        widthMm: 65,
        pieceCount: 200,
        quantityPallets: 1,
        fromMachineId: "nk1",
      },
      cutByIso: "2026-11-30T17:00:00+03:00",
      machines,
      laneJobsByMachine,
    });

    const recommended = suggestions.find((row) => row.recommended);
    const finish = recommended?.estimatedFinishIso
      ? new Date(recommended.estimatedFinishIso)
      : null;
    expect(finish?.getTime()).toBeGreaterThan(
      new Date("2026-10-08T12:00:00.000Z").getTime(),
    );
  });

  it("does not return unix epoch finish dates on empty lanes", () => {
    const suggestions = suggestMoveTargets({
      movingJob: {
        jobId: "move-me",
        widthMm: 115,
        pieceCount: 550,
        quantityPallets: 1,
        fromMachineId: "",
      },
      cutByIso: "2028-10-07T17:00:00",
      machines: [
        {
          id: "s1",
          code: "S1",
          currentWidthMm: 115,
          dailyRatePieces: 240,
          piecesPerDay: 2000,
        },
      ],
      laneJobsByMachine: new Map(),
    });

    for (const row of suggestions) {
      if (!row.estimatedFinishIso) continue;
      expect(new Date(row.estimatedFinishIso).getFullYear()).toBeGreaterThan(2020);
    }
  });
});
