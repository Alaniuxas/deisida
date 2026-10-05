import { describe, expect, it } from "vitest";
import {
  findDeadlineImpacts,
  findNewlyLateJobs,
  isJobPastDeadline,
  type JobPlanSnapshot,
} from "./deadline-impact";

function snapshot(
  overrides: Partial<JobPlanSnapshot> & Pick<JobPlanSnapshot, "jobId">,
): JobPlanSnapshot {
  return {
    proposalNumber: overrides.proposalNumber ?? "ORD-1",
    machineCode: overrides.machineCode ?? "NK1",
    widthMm: overrides.widthMm ?? 65,
    deadline: overrides.deadline ?? "2026-10-08",
    plannedStart: overrides.plannedStart ?? "2026-10-06T08:00:00+03:00",
    plannedEnd: overrides.plannedEnd ?? "2026-10-06T12:00:00+03:00",
    ...overrides,
  };
}

describe("isJobPastDeadline", () => {
  it("treats finish after cut-by (pn 17:00) as late", () => {
    expect(
      isJobPastDeadline("2026-10-08T18:00:00+03:00", "2026-10-08"),
    ).toBe(true);
    expect(
      isJobPastDeadline("2026-10-08T16:00:00+03:00", "2026-10-08"),
    ).toBe(false);
  });
});

describe("findDeadlineImpacts", () => {
  it("flags jobs pushed past deadline after reschedule", () => {
    const before = [
      snapshot({
        jobId: "j1",
        proposalNumber: "DEI-100",
        plannedEnd: "2026-10-07T16:00:00+03:00",
        deadline: "2026-10-08",
      }),
    ];
    const after = [
      snapshot({
        jobId: "j1",
        proposalNumber: "DEI-100",
        machineCode: "NK2",
        plannedStart: "2026-10-09T08:00:00+03:00",
        plannedEnd: "2026-10-09T17:00:00+03:00",
        deadline: "2026-10-08",
      }),
    ];

    const impacts = findDeadlineImpacts(before, after);
    expect(impacts).toHaveLength(1);
    expect(impacts[0].wasOnTimeBefore).toBe(true);
    expect(impacts[0].moved).toBe(true);
    expect(impacts[0].fromMachineCode).toBe("NK1");
    expect(findNewlyLateJobs(impacts)).toHaveLength(1);
  });

  it("ignores jobs that stay on time", () => {
    const before = [
      snapshot({
        jobId: "j1",
        plannedEnd: "2026-10-06T12:00:00+03:00",
      }),
    ];
    const after = [
      snapshot({
        jobId: "j1",
        machineCode: "NK2",
        plannedStart: "2026-10-06T13:00:00+03:00",
        plannedEnd: "2026-10-06T16:00:00+03:00",
      }),
    ];

    expect(findDeadlineImpacts(before, after)).toHaveLength(0);
  });

  it("ignores unchanged late jobs", () => {
    const row = snapshot({
      jobId: "j1",
      plannedEnd: "2026-10-10T17:00:00+03:00",
      deadline: "2026-10-08",
    });
    expect(findDeadlineImpacts([row], [row])).toHaveLength(0);
  });
});
