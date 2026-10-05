import { describe, expect, it } from "vitest";
import { formatDowntimeNotice } from "./downtime-summary";

describe("formatDowntimeNotice", () => {
  it("formats move summary for notice banner", () => {
    const notice = formatDowntimeNotice([
      {
        jobId: "a",
        fromMachineId: "nk1",
        toMachineId: "nk2",
        fromMachineCode: "NK1",
        toMachineCode: "NK2",
        jobWidthMm: 14,
        fromStart: "2026-10-05T05:00:00.000Z",
        toStart: "2026-10-05T06:00:00.000Z",
        reason: "",
      },
      {
        jobId: "b",
        fromMachineId: "nk1",
        toMachineId: "nk2",
        fromMachineCode: "NK1",
        toMachineCode: "NK2",
        jobWidthMm: 10,
        reason: "",
      },
      {
        jobId: "c",
        fromMachineId: "nk1",
        toMachineId: "s2",
        fromMachineCode: "NK1",
        toMachineCode: "S2",
        jobWidthMm: 65,
        fromStart: "2026-10-05T05:00:00.000Z",
        toStart: "2026-10-05T07:00:00.000Z",
        reason: "",
      },
    ]);

    expect(notice).toContain("perkelta 3 darb.");
    expect(notice).toContain("NK1→NK2: 2");
    expect(notice).toContain("NK1→S2: 1");
  });

  it("appends confirmed late count", () => {
    const notice = formatDowntimeNotice([], { confirmedLateCount: 2 });
    expect(notice).toContain("2 užsak. bus supjauta po termino (patvirtinta)");
  });

  it("appends manual job count", () => {
    const notice = formatDowntimeNotice([], { manualJobCount: 3 });
    expect(notice).toContain("3 užsak. palikta staklėse — perkelkite rankiniu būdu");
  });
});
