import { describe, expect, it } from "vitest";
import { orderJobsByP1P2P3, widthDelta } from "./width-order";

function makeJob(
  id: string,
  widthMm: number,
  deadline = "2026-10-15",
  proposalId = `proposal-${id}`,
  storisMm = 20,
  pieceCount = 100,
) {
  return { id, widthMm, storisMm, deadline, proposalId, pieceCount };
}

describe("orderJobsByP1P2P3 minimal regulation", () => {
  it("walks P3 jobs in smallest width steps from current setup", () => {
    const ordered = orderJobsByP1P2P3(
      [
        makeJob("urgent", 50, "2026-10-08"),
        makeJob("december", 108, "2026-12-31"),
        makeJob("soon", 90, "2026-10-12"),
      ],
      100,
      0,
      (job) => job.widthMm,
      (job) => job.storisMm,
      (job) => job.deadline,
    );

    expect(ordered.map((job) => job.id)).toEqual(["december", "soon", "urgent"]);
    expect(widthDelta(100, 108)).toBeLessThan(widthDelta(100, 50));
  });

  it("uses deadline only when width step is equal", () => {
    const ordered = orderJobsByP1P2P3(
      [makeJob("later", 110, "2026-10-20"), makeJob("sooner", 90, "2026-10-10")],
      100,
      0,
      (job) => job.widthMm,
      (job) => job.storisMm,
      (job) => job.deadline,
    );

    expect(ordered.map((job) => job.id)).toEqual(["sooner", "later"]);
  });

  it("treats matching width as P1 when machine storis is unset", () => {
    const ordered = orderJobsByP1P2P3(
      [
        makeJob("line-b", 14, "2026-11-11", "DEI240710-1", 52, 5),
        makeJob("line-a", 14, "2026-11-11", "DEI240710-1", 52, 1),
        makeJob("other", 113, "2026-10-29"),
      ],
      14,
      0,
      (job) => job.widthMm,
      (job) => job.storisMm,
      (job) => job.deadline,
      (job) => job.proposalId,
      (job) => job.pieceCount,
    );

    expect(ordered.map((job) => job.id)).toEqual(["line-a", "line-b", "other"]);
  });
});
