import { describe, expect, it } from "vitest";
import {
  alignAiCommentsWithRebalance,
  analyzeRebalanceState,
  buildRebalanceBuckets,
  findRebalanceMove,
} from "./rebalance";

const machines = [
  { id: "nk1", code: "NK1", currentWidthMm: 14 },
  { id: "nk2", code: "NK2", currentWidthMm: 10 },
  { id: "s2", code: "S2", currentWidthMm: 51 },
];

const shopIds = ["nk1", "nk2", "s2"];
const LOCKED_WEEK = { startIso: "2026-10-05", endIso: "2026-10-09" };

describe("rebalance", () => {
  it("finds compatible move when width matches", () => {
    const buckets = buildRebalanceBuckets(shopIds, [
      { jobId: "a", machineId: "nk1", widthMm: 51, plannedStart: "2026-10-05T05:00:00.000Z", plannedEnd: "2026-10-05T10:00:00.000Z" },
      { jobId: "b", machineId: "nk1", widthMm: 14, plannedStart: "2026-10-05T10:00:00.000Z", plannedEnd: "2026-10-06T10:00:00.000Z" },
      { jobId: "c", machineId: "nk1", widthMm: 14, plannedStart: "2026-10-06T10:00:00.000Z", plannedEnd: "2026-10-07T10:00:00.000Z" },
      { jobId: "d", machineId: "nk1", widthMm: 14, plannedStart: "2026-10-07T10:00:00.000Z", plannedEnd: "2026-10-08T10:00:00.000Z" },
      { jobId: "e", machineId: "s2", widthMm: 65, plannedStart: "2026-10-05T05:00:00.000Z", plannedEnd: "2026-10-05T10:00:00.000Z" },
      { jobId: "f", machineId: "s2", widthMm: 65, plannedStart: "2026-10-05T10:00:00.000Z", plannedEnd: "2026-10-06T08:00:00.000Z" },
      { jobId: "g", machineId: "nk2", widthMm: 10, plannedStart: "2026-10-05T05:00:00.000Z", plannedEnd: "2026-10-05T09:00:00.000Z" },
      { jobId: "h", machineId: "nk2", widthMm: 10, plannedStart: "2026-10-05T09:00:00.000Z", plannedEnd: "2026-10-06T08:00:00.000Z" },
    ]);

    const machineById = new Map(
      machines.map((machine) => [
        machine.id,
        { code: machine.code, currentWidthMm: machine.currentWidthMm },
      ]),
    );

    const move = findRebalanceMove(buckets, shopIds, machineById, LOCKED_WEEK);
    expect(move?.donorCode).toBe("NK1");
    expect(move?.receiverCode).toBe("NK2");
    expect(move?.candidate.widthMm).toBe(14);
  });

  it("does not dump onto a receiver that is already full until Friday", () => {
    const fridayEnd = "2026-10-09T14:00:00.000Z";
    const buckets = buildRebalanceBuckets(shopIds, [
      { jobId: "a", machineId: "nk1", widthMm: 14, plannedStart: "2026-10-05T05:00:00.000Z", plannedEnd: "2026-10-06T09:00:00.000Z" },
      { jobId: "b", machineId: "nk1", widthMm: 14, plannedStart: "2026-10-06T09:00:00.000Z", plannedEnd: "2026-10-07T09:00:00.000Z" },
      { jobId: "c", machineId: "nk1", widthMm: 14, plannedStart: "2026-10-07T09:00:00.000Z", plannedEnd: "2026-10-08T09:00:00.000Z" },
      { jobId: "d", machineId: "nk1", widthMm: 14, plannedStart: "2026-10-08T09:00:00.000Z", plannedEnd: fridayEnd },
      { jobId: "full-a", machineId: "nk2", widthMm: 10, plannedStart: "2026-10-05T05:00:00.000Z", plannedEnd: "2026-10-07T14:00:00.000Z" },
      { jobId: "full-b", machineId: "nk2", widthMm: 10, plannedStart: "2026-10-08T05:00:00.000Z", plannedEnd: fridayEnd },
      { jobId: "s2a", machineId: "s2", widthMm: 65, plannedStart: "2026-10-05T05:00:00.000Z", plannedEnd: fridayEnd },
    ]);
    const machineById = new Map(
      machines.map((machine) => [
        machine.id,
        { code: machine.code, currentWidthMm: machine.currentWidthMm },
      ]),
    );

    const move = findRebalanceMove(buckets, shopIds, machineById, LOCKED_WEEK);
    expect(move).toBeNull();
  });

  it("blocks NK1 to NK2 when widths differ", () => {
    const state = analyzeRebalanceState(
      shopIds,
      [
        { jobId: "a", machineId: "nk1", widthMm: 20, plannedStart: "2026-10-05T05:00:00.000Z" },
        { jobId: "b", machineId: "nk1", widthMm: 60, plannedStart: "2026-10-05T09:00:00.000Z" },
        { jobId: "c", machineId: "nk1", widthMm: 95, plannedStart: "2026-10-06T08:00:00.000Z" },
        { jobId: "d", machineId: "nk1", widthMm: 95, plannedStart: "2026-10-07T08:00:00.000Z" },
        { jobId: "e", machineId: "nk2", widthMm: 10, plannedStart: "2026-10-05T05:00:00.000Z" },
        { jobId: "f", machineId: "nk2", widthMm: 10, plannedStart: "2026-10-05T09:00:00.000Z" },
      ],
      machines,
      LOCKED_WEEK,
    );

    expect(state.canRebalance).toBe(false);
    expect(state.reason).toBe("Automatinio perskirstymo nėra.");
  });

  it("strips impossible AI move suggestions", () => {
    const aligned = alignAiCommentsWithRebalance(
      [
        "NK2: per mažai darbų — perkelti 1 iš NK1.",
        "S4: 4 darbai su mažais matmenimis.",
      ],
      {
        canRebalance: false,
        pendingMoveCount: 0,
        reason: "Automatinio perskirstymo nėra.",
        blockers: [],
        nextMove: null,
      },
    );

    expect(aligned).toEqual([]);
  });
});
