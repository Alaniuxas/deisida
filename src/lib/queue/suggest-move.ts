import { DEFAULT_CHANGEOVER_MINUTES } from "./constants";
import {
  CHANGEOVER_ASSIGN_MAX_GAP_MM,
  nextSetupWidthAfterJob,
  requiresWidthChangeoverFromSetup,
} from "./machine-width";
import { computeJobDurationHours, storedWidthOrUnknown } from "./schedule";
import { addWorkDuration, snapToWorkStart } from "./work-hours";
import type { Machine } from "./types";

/** Jei iki termino >3 d. — renkame natūralią eilės vietą arti termino, ne „kiek galima anksčiau“. */
const LOOSE_DEADLINE_MS = 3 * 24 * 60 * 60 * 1000;

export interface MoveLaneJob {
  jobId: string;
  widthMm: number;
  pieceCount: number;
  quantityPallets: number;
  estimatedStart: Date;
  estimatedEnd: Date;
  status?: string;
}

export interface MoveTargetMachine {
  id: string;
  code: string;
  currentWidthMm: number;
  dailyRatePieces: number;
  piecesPerDay?: number;
  changeoverMinutes?: number;
}

export interface MoveTargetSuggestion {
  machineId: string;
  machineCode: string;
  storedWidthMm: number;
  widthGapMm: number;
  eligible: boolean;
  requiresChangeover: boolean;
  estimatedFinishIso: string | null;
  meetsDeadline: boolean;
  reason: string;
  recommended: boolean;
}

export interface BestLaneSlot {
  orderedJobIds: string[];
  requiresChangeover: boolean;
  estimatedFinish: Date | null;
  setupGapMm: number;
  reason: string;
}

function initialLaneSetup(
  machine: MoveTargetMachine,
  inProgress: MoveLaneJob[],
): number {
  const stored = storedWidthOrUnknown(machine.currentWidthMm) ?? 0;
  if (stored > 0) {
    return stored;
  }
  const running = inProgress.find((job) => job.status === "in_progress");
  if (running) {
    return running.widthMm;
  }
  return 0;
}

function walkSetupThroughJobs(
  startSetup: number,
  jobs: MoveLaneJob[],
): number {
  let setup = startSetup;
  for (const job of jobs) {
    setup = nextSetupWidthAfterJob(setup, job.widthMm);
  }
  return setup;
}

function isLooseDeadline(
  cutBy: Date,
  candidates: Array<{ finishMs: number }>,
): boolean {
  if (candidates.length === 0) {
    return false;
  }
  const earliest = Math.min(...candidates.map((row) => row.finishMs));
  return cutBy.getTime() - earliest >= LOOSE_DEADLINE_MS;
}

function compareFinishPreference(
  leftFinishMs: number,
  rightFinishMs: number,
  cutByMs: number,
  loose: boolean,
): number {
  if (loose) {
    return (
      Math.abs(cutByMs - leftFinishMs) - Math.abs(cutByMs - rightFinishMs)
    );
  }
  return rightFinishMs - leftFinishMs;
}

function compareSlotCandidates(
  left: { requiresChangeover: boolean; setupGapMm: number; finishMs: number },
  right: { requiresChangeover: boolean; setupGapMm: number; finishMs: number },
  cutByMs: number,
  loose: boolean,
): number {
  if (left.requiresChangeover !== right.requiresChangeover) {
    return left.requiresChangeover ? 1 : -1;
  }
  if (left.setupGapMm !== right.setupGapMm) {
    return left.setupGapMm - right.setupGapMm;
  }
  return compareFinishPreference(left.finishMs, right.finishMs, cutByMs, loose);
}

function sortedLaneWithoutMoving(laneJobs: MoveLaneJob[], movingJobId: string) {
  const rest = laneJobs
    .filter((laneJob) => laneJob.jobId !== movingJobId)
    .sort((left, right) => {
      const leftBusy = left.status === "in_progress" ? 0 : 1;
      const rightBusy = right.status === "in_progress" ? 0 : 1;
      if (leftBusy !== rightBusy) {
        return leftBusy - rightBusy;
      }
      return left.estimatedStart.getTime() - right.estimatedStart.getTime();
    });

  return {
    inProgress: rest.filter((laneJob) => laneJob.status === "in_progress"),
    queued: rest.filter((laneJob) => laneJob.status !== "in_progress"),
  };
}

function simulateInsertAtIndex(
  machine: MoveTargetMachine,
  inProgress: MoveLaneJob[],
  queued: MoveLaneJob[],
  movingJob: MoveLaneJob,
  insertIndex: number,
): { finish: Date | null; requiresChangeover: boolean; setupGapMm: number; setupBeforeMoving: number } {
  const before = [...inProgress, ...queued.slice(0, insertIndex)];

  const setupBeforeMoving = walkSetupThroughJobs(
    initialLaneSetup(machine, inProgress),
    before,
  );

  let cursor =
    inProgress.length > 0
      ? inProgress[0].estimatedStart
      : snapToWorkStart(new Date());

  for (const job of before) {
    if (job.status === "in_progress") {
      cursor = new Date(job.estimatedEnd);
    } else {
      cursor = new Date(Math.max(cursor.getTime(), job.estimatedEnd.getTime()));
    }
  }

  const requiresChangeover = requiresWidthChangeoverFromSetup(
    setupBeforeMoving,
    movingJob.widthMm,
  );
  const setupGapMm = Math.abs(setupBeforeMoving - movingJob.widthMm);

  const plannerMachine: Machine = {
    id: machine.id,
    currentWidthMm: machine.currentWidthMm,
    dailyRatePieces: machine.dailyRatePieces,
    changeoverMinutes: machine.changeoverMinutes ?? DEFAULT_CHANGEOVER_MINUTES,
    piecesPerDay: machine.piecesPerDay,
  };

  const { productionHours, changeoverHours } = computeJobDurationHours(
    {
      quantityPallets: movingJob.quantityPallets,
      tileWidthMm: movingJob.widthMm,
      pieceCount: movingJob.pieceCount,
    },
    plannerMachine,
    setupBeforeMoving,
  );

  let start = cursor;
  if (changeoverHours > 0) {
    start = addWorkDuration(start, changeoverHours).end;
  }
  const finish = addWorkDuration(start, productionHours).end;

  return { finish, requiresChangeover, setupGapMm, setupBeforeMoving };
}

function describeChangeoverReason(
  setupWidthMm: number,
  jobWidthMm: number,
  requiresChangeover: boolean,
): string {
  const setupLabel =
    setupWidthMm > 0
      ? `Projektuojamas setup ${setupWidthMm} mm (pagal eilę)`
      : "Setup pagal eilę dar nenustatytas";
  if (!requiresChangeover) {
    return `${setupLabel}; telpa be reguliavimo`;
  }
  const from = setupWidthMm > 0 ? setupWidthMm : jobWidthMm;
  const gap = Math.abs(from - jobWidthMm);
  const band =
    gap <= CHANGEOVER_ASSIGN_MAX_GAP_MM
      ? `≤${CHANGEOVER_ASSIGN_MAX_GAP_MM} mm`
      : `>${CHANGEOVER_ASSIGN_MAX_GAP_MM} mm`;
  return `${setupLabel}; reikės reguliavimo ${from} → ${jobWidthMm} mm (${band})`;
}

/** Randa geriausią įterpimo vietą eilėje — ne visada į priekį. */
export function buildBestLaneSlot(
  machine: MoveTargetMachine,
  laneJobs: MoveLaneJob[],
  movingJob: {
    jobId: string;
    widthMm: number;
    pieceCount: number;
    quantityPallets: number;
  },
  cutByIso: string,
): BestLaneSlot {
  const cutBy = new Date(cutByIso);
  const { inProgress, queued } = sortedLaneWithoutMoving(laneJobs, movingJob.jobId);
  const movingLaneJob: MoveLaneJob = {
    jobId: movingJob.jobId,
    widthMm: movingJob.widthMm,
    pieceCount: movingJob.pieceCount,
    quantityPallets: movingJob.quantityPallets,
    estimatedStart: new Date(0),
    estimatedEnd: new Date(0),
    status: "queued",
  };

  type Candidate = BestLaneSlot & { finishMs: number; setupGapMm: number };
  const candidates: Candidate[] = [];

  for (let insertIndex = 0; insertIndex <= queued.length; insertIndex += 1) {
    const { finish, requiresChangeover, setupGapMm, setupBeforeMoving } =
      simulateInsertAtIndex(
      machine,
      inProgress,
      queued,
      movingLaneJob,
      insertIndex,
    );
    if (!finish) continue;

    const meetsDeadline = finish.getTime() <= cutBy.getTime();
    const placementReason = describeChangeoverReason(
      setupBeforeMoving,
      movingJob.widthMm,
      requiresChangeover,
    );

    candidates.push({
      orderedJobIds: [
        ...inProgress.map((job) => job.jobId),
        ...queued.slice(0, insertIndex).map((job) => job.jobId),
        movingJob.jobId,
        ...queued.slice(insertIndex).map((job) => job.jobId),
      ],
      requiresChangeover,
      estimatedFinish: finish,
      finishMs: finish.getTime(),
      setupGapMm,
      reason: meetsDeadline
        ? `${placementReason}; baigtų iki termino`
        : `${placementReason}; baigtų po termino`,
    });
  }

  if (candidates.length === 0) {
    return {
      orderedJobIds: [
        ...inProgress.map((job) => job.jobId),
        movingJob.jobId,
        ...queued.map((job) => job.jobId),
      ],
      requiresChangeover: true,
      estimatedFinish: null,
      setupGapMm: Math.abs((machine.currentWidthMm ?? 0) - movingJob.widthMm),
      reason: "Nepavyko simuliuoti eilės",
    };
  }

  const viable = candidates.filter(
    (row) => row.estimatedFinish && row.estimatedFinish.getTime() <= cutBy.getTime(),
  );
  const pool = viable.length > 0 ? viable : candidates;
  const loose = isLooseDeadline(cutBy, pool);
  const cutByMs = cutBy.getTime();

  pool.sort((left, right) =>
    compareSlotCandidates(left, right, cutByMs, loose),
  );

  const pick = pool[0];
  return {
    orderedJobIds: pick.orderedJobIds,
    requiresChangeover: pick.requiresChangeover,
    estimatedFinish: pick.estimatedFinish,
    setupGapMm: pick.setupGapMm,
    reason: pick.reason,
  };
}

function compareSuggestions(
  left: MoveTargetSuggestion,
  right: MoveTargetSuggestion,
  cutBy: Date,
) {
  if (left.recommended !== right.recommended) {
    return left.recommended ? -1 : 1;
  }
  if (left.meetsDeadline !== right.meetsDeadline) {
    return left.meetsDeadline ? -1 : 1;
  }
  if (left.requiresChangeover !== right.requiresChangeover) {
    return left.requiresChangeover ? 1 : -1;
  }
  if (left.widthGapMm !== right.widthGapMm) {
    return left.widthGapMm - right.widthGapMm;
  }
  const leftFinish = left.estimatedFinishIso
    ? new Date(left.estimatedFinishIso).getTime()
    : Number.POSITIVE_INFINITY;
  const rightFinish = right.estimatedFinishIso
    ? new Date(right.estimatedFinishIso).getTime()
    : Number.POSITIVE_INFINITY;
  const loose = isLooseDeadline(cutBy, [
    { finishMs: leftFinish },
    { finishMs: rightFinish },
  ]);
  const finishCmp = compareFinishPreference(
    leftFinish,
    rightFinish,
    cutBy.getTime(),
    loose,
  );
  if (finishCmp !== 0) {
    return finishCmp;
  }
  return left.machineCode.localeCompare(right.machineCode, "lt");
}

export function suggestMoveTargets(input: {
  movingJob: {
    jobId: string;
    widthMm: number;
    pieceCount: number;
    quantityPallets: number;
    fromMachineId: string;
  };
  cutByIso: string;
  machines: MoveTargetMachine[];
  laneJobsByMachine: Map<string, MoveLaneJob[]>;
}): MoveTargetSuggestion[] {
  const cutBy = new Date(input.cutByIso);
  if (Number.isNaN(cutBy.getTime())) {
    return [];
  }

  const suggestions: MoveTargetSuggestion[] = [];

  for (const machine of input.machines) {
    const laneJobs = input.laneJobsByMachine.get(machine.id) ?? [];
    const stored = machine.currentWidthMm ?? 0;
    const slot = buildBestLaneSlot(machine, laneJobs, input.movingJob, input.cutByIso);
    const estimatedFinish = slot.estimatedFinish;
    const meetsDeadline =
      estimatedFinish != null && estimatedFinish.getTime() <= cutBy.getTime();

    suggestions.push({
      machineId: machine.id,
      machineCode: machine.code,
      storedWidthMm: stored,
      widthGapMm: slot.setupGapMm,
      eligible: true,
      requiresChangeover: slot.requiresChangeover,
      estimatedFinishIso: estimatedFinish?.toISOString() ?? null,
      meetsDeadline,
      reason: slot.reason,
      recommended: false,
    });
  }

  const viable = suggestions.filter((row) => row.meetsDeadline);
  const pool = viable.length > 0 ? viable : suggestions;
  const finishMs = (row: MoveTargetSuggestion) =>
    row.estimatedFinishIso
      ? new Date(row.estimatedFinishIso).getTime()
      : Number.POSITIVE_INFINITY;
  const loose = isLooseDeadline(
    cutBy,
    pool.map((row) => ({ finishMs: finishMs(row) })),
  );
  const cutByMs = cutBy.getTime();

  const sortedPool = [...pool].sort((left, right) => {
    if (left.requiresChangeover !== right.requiresChangeover) {
      return left.requiresChangeover ? 1 : -1;
    }
    if (left.widthGapMm !== right.widthGapMm) {
      return left.widthGapMm - right.widthGapMm;
    }
    return compareFinishPreference(
      finishMs(left),
      finishMs(right),
      cutByMs,
      loose,
    );
  });

  if (sortedPool[0]) {
    sortedPool[0].recommended = true;
  }

  return suggestions.sort((left, right) => compareSuggestions(left, right, cutBy));
}
