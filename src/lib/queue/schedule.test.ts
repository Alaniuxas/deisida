import { describe, expect, it } from "vitest";
import { isTimestampInLockedWeek, zonedTimeToUtc } from "./week";
import {
  pickMachine,
  scheduleQueue,
  sortJobsForMachine,
  recalculateLaneAssignments,
  jobPriority,
} from "./schedule";
import { isWithinWorkHours } from "./work-hours";
import type { Machine, QueueJob } from "./types";

function vilnius(year: number, month: number, day: number, hour = 8, minute = 0) {
  return zonedTimeToUtc(year, month, day, hour, minute);
}

const LOCKED_WEEK = { startIso: "2026-10-05", endIso: "2026-10-09" };

function makeJob(
  id: string,
  tileWidthMm: number,
  deadline = "2026-10-15",
  proposalId = `proposal-${id}`,
  quantityPallets = 1,
  storisMm = 20,
  pieceCount = 100,
): QueueJob {
  return {
    id,
    tileWidthMm,
    storisMm,
    quantityPallets,
    pieceCount,
    deadline,
    cutType: "pjovimas",
    proposalId,
  };
}

function makeMachine(
  id: string,
  currentWidthMm: number,
  dailyRatePieces = 240,
  availableAtHours = 0,
) {
  return {
    id,
    currentWidthMm,
    dailyRatePieces,
    changeoverMinutes: 30,
    piecesPerDay: dailyRatePieces === 720 ? 8000 : 2500,
    availableAtHours,
    assignedJobs: [] as QueueJob[],
  };
}

function plannerMachine(
  id: string,
  currentWidthMm: number,
  dailyRatePieces = 240,
  piecesPerDay?: number,
): Machine {
  return {
    id,
    currentWidthMm,
    dailyRatePieces,
    changeoverMinutes: 30,
    piecesPerDay: piecesPerDay ?? (dailyRatePieces === 720 ? 8000 : 2500),
  };
}

describe("jobPriority", () => {
  it("labels first job P1 when machine width already matches", () => {
    const job = { tileWidthMm: 14, storisMm: 52 };
    expect(jobPriority(job, null, 14)).toBe("P1");
    expect(jobPriority(job, job, 14)).toBe("P1");
  });
});

describe("sortJobsForMachine", () => {
  it("orders exact width first, then P3 by smallest width step", () => {
    const jobs = [
      makeJob("exact", 100),
      makeJob("far", 10, "2026-10-20"),
      makeJob("near", 108, "2026-10-15"),
    ];

    const ordered = sortJobsForMachine(jobs, 100);

    expect(ordered.map((job) => job.id)).toEqual(["exact", "near", "far"]);
  });

  it("keeps P1 same storis before P2 other storis at the same width", () => {
    const jobs = [
      makeJob("p2", 100, "2026-10-10", "p2", 1, 30),
      makeJob("p1", 100, "2026-10-20", "p1", 1, 20),
    ];

    const ordered = sortJobsForMachine(jobs, 100, 20);

    expect(ordered.map((job) => job.id)).toEqual(["p1", "p2"]);
  });

  it("orders P3 by smallest width step, then deadline when tied", () => {
    const jobs = [
      makeJob("later", 110, "2026-10-20"),
      makeJob("sooner", 90, "2026-10-10"),
    ];

    const ordered = sortJobsForMachine(jobs, 100);

    expect(ordered.map((job) => job.id)).toEqual(["sooner", "later"]);
  });

  it("minimizes width steps on P3 even when a far deadline is closer in mm", () => {
    const jobs = [
      makeJob("december", 108, "2026-12-31"),
      makeJob("urgent", 50, "2026-10-08"),
      makeJob("soon", 90, "2026-10-12"),
    ];

    const ordered = sortJobsForMachine(jobs, 100);

    expect(ordered.map((job) => job.id)).toEqual(["december", "soon", "urgent"]);
  });
});

describe("pickMachine", () => {
  it("sends 101 mm to NK1 when both idle (NK1 100, SK1 14)", () => {
    const picked = pickMachine(
      [makeMachine("SK1", 14), makeMachine("NK1", 100, 720)],
      101,
    );

    expect(picked.id).toBe("NK1");
  });

  it("sends 10 mm to SK1 when both idle (NK1 100, SK1 14)", () => {
    const picked = pickMachine(
      [makeMachine("SK1", 14), makeMachine("NK1", 100, 720)],
      10,
    );

    expect(picked.id).toBe("SK1");
  });
});

describe("scheduleQueue P1/P2 clustering", () => {
  it("keeps 101 mm and 102 mm with the 100 mm machine; empty gets farthest", () => {
    const assignments = scheduleQueue(
      [plannerMachine("SK1", 0), plannerMachine("NK1", 100, 720)],
      [
        makeJob("w100", 100, "2026-10-01", "a", 2, 20, 200),
        makeJob("w101", 101, "2026-10-02", "b", 2, 20, 200),
        makeJob("w102", 102, "2026-10-03", "c", 2, 20, 200),
        makeJob("far", 10, "2026-10-04", "d", 2, 20, 200),
      ],
    );

    const byJob = Object.fromEntries(
      assignments.map((assignment) => [assignment.jobId, assignment.machineId]),
    );

    expect(byJob.w100).toBe("NK1");
    expect(byJob.w101).toBe("NK1");
    expect(byJob.w102).toBe("NK1");
    expect(byJob.far).toBe("SK1");
  });

  it("balances 101 mm onto idle SK1 when NK1 is overloaded", () => {
    const assignments = scheduleQueue(
      [plannerMachine("SK1", 0), plannerMachine("NK1", 100, 720)],
      [
        makeJob("long", 100, "2026-10-01", "fill", 200, 20, 20000),
        makeJob("next", 101, "2026-10-20", "overflow", 1, 20, 100),
      ],
    );

    const byJob = Object.fromEntries(
      assignments.map((assignment) => [assignment.jobId, assignment.machineId]),
    );

    expect(byJob.long).toBe("NK1");
    expect(byJob.next).toBe("SK1");
  });

  it("both idle: 101 mm to higher-rate NK1, 10 mm to SK1 (farthest)", () => {
    const assignments = scheduleQueue(
      [plannerMachine("SK1", 0), plannerMachine("NK1", 0, 720)],
      [
        makeJob("wide", 101, "2026-10-10"),
        makeJob("narrow", 10, "2026-10-11"),
      ],
    );

    const byJob = Object.fromEntries(
      assignments.map((assignment) => [assignment.jobId, assignment.machineId]),
    );

    expect(byJob).toEqual({ wide: "NK1", narrow: "SK1" });
  });

  it("both idle: 100 mm job goes to NK1 (higher pal./d.)", () => {
    const assignments = scheduleQueue(
      [plannerMachine("SK1", 0), plannerMachine("NK1", 0, 720)],
      [makeJob("hundred", 100)],
    );

    expect(assignments).toHaveLength(1);
    expect(assignments[0].machineId).toBe("NK1");
  });

  it("orders a lane P2 width match first, then P3 by deadline", () => {
    const assignments = scheduleQueue(
      [plannerMachine("SK1", 100), plannerMachine("NK1", 200, 720)],
      [
        makeJob("far", 10, "2026-10-12"),
        makeJob("exact", 100, "2026-10-11"),
        makeJob("near", 103, "2026-10-10"),
      ],
    );

    const sk1 = assignments
      .filter((assignment) => assignment.machineId === "SK1")
      .sort(
        (left, right) =>
          left.estimatedStart.getTime() - right.estimatedStart.getTime(),
      );

    // 10 mm arčiau SK1@100 (90 mm) nei NK1@200 (190 mm) — prioritetas mažiausias žingsnis, ne „nepriskirti“
    expect(sk1.map((assignment) => assignment.jobId)).toEqual([
      "exact",
      "near",
      "far",
    ]);
  });

  it("sequences tiny jobs one after another on the same lane", () => {
    const machine = plannerMachine("NK1", 14, 720, 8000);
    const start = new Date("2026-10-07T12:34:00.000Z");
    const base = {
      machineId: "NK1",
      proposalId: "p1",
      cutType: "pjovimas",
      tileWidthMm: 14,
      storisMm: 52,
      quantityPallets: 1,
      changeoverHours: 0,
      pickCriterion: "p1" as const,
      pickStartHours: 0,
      otherMachineId: null,
      otherStartHours: null,
      priority: "P1" as const,
    };

    const recalculated = recalculateLaneAssignments(
      [
        {
          job: { pieceCount: 5, widthMm: 14, status: "queued" },
          assignment: {
            ...base,
            jobId: "a",
            durationHours: 0.1,
            estimatedStart: start,
            estimatedEnd: start,
          },
        },
        {
          job: { pieceCount: 1, widthMm: 14, status: "queued" },
          assignment: {
            ...base,
            jobId: "b",
            durationHours: 0.1,
            estimatedStart: start,
            estimatedEnd: start,
          },
        },
      ],
      machine,
    );

    expect(recalculated[0]?.estimatedEnd.getTime()).toBeLessThanOrEqual(
      recalculated[1]?.estimatedStart.getTime() ?? 0,
    );
    expect(recalculated[0]?.estimatedEnd.getTime()).toBeGreaterThan(
      recalculated[0]?.estimatedStart.getTime() ?? 0,
    );
  });

  it("cuts matching queue width before wider jobs when machine width is unset", () => {
    const assignments = scheduleQueue(
      [plannerMachine("S4", 115, 240)],
      [
        makeJob("wide-early", 120, "2026-10-10"),
        makeJob("match", 113, "2026-10-23"),
      ],
      {
        referenceTime: vilnius(2026, 10, 5, 8, 0),
        lockedWeek: LOCKED_WEEK,
        balanceLockedWeek: false,
      },
    );

    const s4 = assignments
      .filter((assignment) => assignment.machineId === "S4")
      .sort(
        (left, right) =>
          left.estimatedStart.getTime() - right.estimatedStart.getTime(),
      );

    expect(s4.map((assignment) => assignment.jobId)).toEqual(["match", "wide-early"]);
    expect(s4[0]?.changeoverHours).toBe(0);
    expect(s4[1]?.changeoverHours).toBe(0);
  });
});

describe("scheduleQueue load balancing", () => {
  const sixMachines: Machine[] = [
    plannerMachine("NK1", 100, 720),
    plannerMachine("NK2", 0, 720),
    plannerMachine("S1", 0, 240),
    plannerMachine("S2", 0, 240),
    plannerMachine("S4", 0, 240),
    plannerMachine("SK1", 14, 240),
  ];

  it("spreads jobs across machines in the locked week instead of leaving lanes empty", () => {
    const jobs = [
      makeJob("a", 100, "2026-10-08"),
      makeJob("b", 101, "2026-10-09"),
      makeJob("c", 102, "2026-10-10"),
      makeJob("d", 90, "2026-10-11"),
      makeJob("e", 50, "2026-10-12"),
      makeJob("f", 10, "2026-10-13"),
    ];

    const assignments = scheduleQueue(sixMachines, jobs, {
      referenceTime: new Date("2026-10-05T05:00:00.000Z"),
      lockedWeek: LOCKED_WEEK,
      balanceLockedWeek: true,
    });

    const locked = assignments.filter((assignment) =>
      isTimestampInLockedWeek(assignment.estimatedStart, LOCKED_WEEK),
    );
    const machinesUsed = new Set(locked.map((assignment) => assignment.machineId));

    expect(locked.length).toBeGreaterThanOrEqual(4);
    expect(machinesUsed.size).toBeGreaterThanOrEqual(4);
  });

  it("keeps job counts closer across six machines for larger queues", () => {
    const jobs = Array.from({ length: 24 }, (_, index) =>
      makeJob(`load-${index}`, 50 + (index % 8) * 5, `2026-10-${8 + (index % 5)}`),
    );

    const assignments = scheduleQueue(sixMachines, jobs, {
      referenceTime: new Date("2026-10-05T05:00:00.000Z"),
      lockedWeek: LOCKED_WEEK,
      balanceLockedWeek: true,
    });

    const counts = Object.fromEntries(
      sixMachines.map((machine) => [
        machine.id,
        assignments.filter((assignment) => assignment.machineId === machine.id).length,
      ]),
    );
    const values = Object.values(counts).filter((count) => count > 0);
    expect(values.length).toBeGreaterThanOrEqual(4);
    expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(12);
  });

  it("orders P3 on NK1 by smallest width step from setup", () => {
    const assignments = scheduleQueue(
      [plannerMachine("NK1", 100, 720)],
      [
        makeJob("december", 104, "2026-12-31"),
        makeJob("urgent", 95, "2026-10-08"),
      ],
      {
        referenceTime: new Date("2026-10-05T05:00:00.000Z"),
        lockedWeek: LOCKED_WEEK,
        balanceLockedWeek: false,
      },
    );

    const nk1 = assignments
      .filter((assignment) => assignment.machineId === "NK1")
      .sort(
        (left, right) =>
          left.estimatedStart.getTime() - right.estimatedStart.getTime(),
      );

    expect(nk1.map((assignment) => assignment.jobId)).toEqual(["december", "urgent"]);
  });
});

describe("scheduleQueue locked-week timing", () => {
  const sixMachines: Machine[] = [
    plannerMachine("NK1", 100, 720),
    plannerMachine("NK2", 0, 720),
    plannerMachine("S1", 0, 240),
    plannerMachine("S2", 0, 240),
    plannerMachine("S4", 0, 240),
    plannerMachine("SK1", 14, 240),
  ];

  function assignmentsForMachine(
    assignments: ReturnType<typeof scheduleQueue>,
    machineId: string,
  ) {
    return assignments
      .filter((assignment) => assignment.machineId === machineId)
      .sort(
        (left, right) =>
          left.estimatedStart.getTime() - right.estimatedStart.getTime(),
      );
  }

  it("chains jobs sequentially on the same machine (end → next start)", () => {
    const jobs = Array.from({ length: 12 }, (_, index) =>
      makeJob(`job-${index}`, 100 + (index % 3), `2026-10-${10 + index}`),
    );

    const assignments = scheduleQueue(sixMachines, jobs, {
      referenceTime: vilnius(2026, 10, 5, 8, 0),
      lockedWeek: LOCKED_WEEK,
      balanceLockedWeek: true,
    });

    for (const machine of sixMachines) {
      const lane = assignmentsForMachine(assignments, machine.id);
      for (let index = 1; index < lane.length; index += 1) {
        expect(lane[index].estimatedStart.getTime()).toBeGreaterThanOrEqual(
          lane[index - 1].estimatedEnd.getTime(),
        );
      }
    }
  });

  it("does not assign duplicate start times on the same machine", () => {
    const jobs = Array.from({ length: 22 }, (_, index) =>
      makeJob(`dup-${index}`, 100 + (index % 4), `2026-10-${8 + (index % 5)}`),
    );

    const assignments = scheduleQueue(sixMachines, jobs, {
      referenceTime: vilnius(2026, 10, 5, 8, 0),
      lockedWeek: LOCKED_WEEK,
      balanceLockedWeek: true,
    });

    for (const machine of sixMachines) {
      const starts = assignmentsForMachine(assignments, machine.id).map(
        (assignment) => assignment.estimatedStart.getTime(),
      );
      expect(new Set(starts).size).toBe(starts.length);
    }
  });

  it("keeps w51 on S2 (51 mm) after load balance, not NK1 (14 mm)", () => {
    const machines: Machine[] = [
      plannerMachine("NK1", 14, 720),
      plannerMachine("NK2", 10, 720),
      plannerMachine("S1", 50, 240),
      plannerMachine("S2", 51, 240),
      plannerMachine("S4", 20, 240),
      plannerMachine("SK1", 40, 240),
    ];
    const jobs = Array.from({ length: 24 }, (_, index) =>
      makeJob(`load-${index}`, 50 + (index % 8) * 5, `2026-10-${8 + (index % 5)}`),
    );
    jobs.push(makeJob("w51-a", 51, "2026-10-10"));
    jobs.push(makeJob("w51-b", 51, "2026-10-11"));

    const assignments = scheduleQueue(machines, jobs, {
      referenceTime: vilnius(2026, 10, 5, 8, 0),
      lockedWeek: LOCKED_WEEK,
      balanceLockedWeek: true,
    });

    for (const jobId of ["w51-a", "w51-b"]) {
      const assignment = assignments.find((row) => row.jobId === jobId);
      expect(["S1", "S2"]).toContain(assignment?.machineId);
      expect(assignment?.machineId).not.toBe("NK1");
      expect(assignment?.changeoverHours).toBe(0);
    }
  });

  it("starts each machine's first locked-week job on Monday 08:00 Vilnius", () => {
    const jobs = Array.from({ length: 18 }, (_, index) =>
      makeJob(`mon-${index}`, 90 + (index % 6), `2026-10-${10 + index}`),
    );

    const assignments = scheduleQueue(sixMachines, jobs, {
      referenceTime: vilnius(2026, 10, 2, 12, 0),
      lockedWeek: LOCKED_WEEK,
      balanceLockedWeek: true,
    });

    for (const machine of sixMachines) {
      const lane = assignmentsForMachine(assignments, machine.id).filter((assignment) =>
        isTimestampInLockedWeek(assignment.estimatedStart, LOCKED_WEEK),
      );
      if (lane.length === 0) continue;
      expect(
        lane[0].estimatedStart.toLocaleDateString("en-CA", {
          timeZone: "Europe/Vilnius",
        }),
      ).toBe("2026-10-05");
    }
  });

  it("chains long queues into later weekdays after Monday start", () => {
    const jobs = Array.from({ length: 8 }, (_, index) =>
      makeJob(
        `spread-${index}`,
        100,
        `2026-10-${10 + index}`,
        `p-${index}`,
        20,
        20,
        8000,
      ),
    );

    const assignments = scheduleQueue([plannerMachine("NK1", 100, 720)], jobs, {
      referenceTime: vilnius(2026, 10, 5, 8, 0),
      lockedWeek: LOCKED_WEEK,
      balanceLockedWeek: true,
    });

    const lockedDays = new Set(
      assignments
        .filter((assignment) =>
          isTimestampInLockedWeek(assignment.estimatedStart, LOCKED_WEEK),
        )
        .map((assignment) =>
          assignment.estimatedStart.toLocaleDateString("en-CA", {
            timeZone: "Europe/Vilnius",
          }),
        ),
    );

    expect(lockedDays.size).toBeGreaterThanOrEqual(2);
    expect(
      assignments[0]?.estimatedStart.toLocaleDateString("en-CA", {
        timeZone: "Europe/Vilnius",
      }),
    ).toBe("2026-10-05");
  });

  it("marks only jobs starting in the locked week as locked", () => {
    const jobs = Array.from({ length: 40 }, (_, index) =>
      makeJob(
        `lock-${index}`,
        100,
        `2026-11-${1 + (index % 20)}`,
        `p-${index}`,
        20,
        20,
        5000,
      ),
    );

    const assignments = scheduleQueue(sixMachines, jobs, {
      referenceTime: vilnius(2026, 10, 5, 8, 0),
      lockedWeek: LOCKED_WEEK,
      balanceLockedWeek: true,
    });

    const locked = assignments.filter((assignment) =>
      isTimestampInLockedWeek(assignment.estimatedStart, LOCKED_WEEK),
    );

    expect(locked.length).toBeGreaterThan(0);
    expect(locked.length).toBeLessThan(assignments.length);
  });

  it("keeps planned times within work hours on each machine lane", () => {
    const jobs = Array.from({ length: 15 }, (_, index) =>
      makeJob(`hours-${index}`, 100 + index, `2026-10-${12 + index}`),
    );

    const assignments = scheduleQueue(sixMachines, jobs, {
      referenceTime: vilnius(2026, 10, 5, 8, 0),
      lockedWeek: LOCKED_WEEK,
      balanceLockedWeek: true,
    });

    for (const assignment of assignments) {
      expect(isWithinWorkHours(assignment.estimatedStart)).toBe(true);
    }
  });
});
