import { describe, expect, it } from "vitest";
import { orderLaneJobsForDisplay } from "./display-order";

describe("orderLaneJobsForDisplay", () => {
  const machine = {
    id: "s1",
    code: "S1",
    currentWidthMm: 50,
  } as const;

  function row(
    id: string,
    widthMm: number,
    startIso: string,
    status = "queued",
  ) {
    return {
      job: {
        id,
        widthMm,
        status,
        storisMm: 40,
        pieceCount: 1000,
        proposalId: "p1",
        deadline: "2026-10-05",
        quantity: 1000,
        quantityUnit: "pieces" as const,
      },
      assignment: {
        jobId: id,
        machineId: "s1",
        estimatedStart: new Date(startIso),
        estimatedEnd: new Date(startIso),
        changeoverHours: 0,
        durationHours: 2,
      },
    };
  }

  it("sorts by planned start when plan order is used", () => {
    const laneJobs = [
      row("late", 50, "2026-10-09T08:00:00.000Z"),
      row("early", 51, "2026-10-05T08:00:00.000Z"),
    ];

    const ordered = orderLaneJobsForDisplay(laneJobs, machine, true);
    expect(ordered.map(({ job }) => job.id)).toEqual(["early", "late"]);
  });

  it("keeps in_progress jobs before queued, each group chronological", () => {
    const laneJobs = [
      row("queued-late", 50, "2026-10-09T08:00:00.000Z"),
      row("active", 50, "2026-10-08T08:00:00.000Z", "in_progress"),
      row("queued-early", 51, "2026-10-05T08:00:00.000Z"),
    ];

    const ordered = orderLaneJobsForDisplay(laneJobs, machine, true);
    expect(ordered.map(({ job }) => job.id)).toEqual([
      "active",
      "queued-early",
      "queued-late",
    ]);
  });
});
