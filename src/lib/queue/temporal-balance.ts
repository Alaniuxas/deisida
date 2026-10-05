import { DEFAULT_CHANGEOVER_MINUTES } from "./constants";
import { isJobEligibleForMachine } from "./assign-job";
import { isJobCompatibleWithStoredSetup } from "./machine-width";
import type { Assignment } from "./types";
import type { LockedWeek } from "./week";
import { vilniusDateIso } from "./week";

export interface TemporalMove {
  jobId: string;
  fromMachineId: string;
  toMachineId: string;
  fromMachineCode: string;
  toMachineCode: string;
  fromWidthMm: number;
  toWidthMm: number;
  jobWidthMm: number;
  fromStart: string;
  toStart: string;
  reason: string;
}

export interface TemporalMachine {
  id: string;
  code: string;
  currentWidthMm: number;
}

function dayIndexInWeek(iso: string, week: LockedWeek): number {
  const day = iso.slice(0, 10);
  if (day < week.startIso || day > week.endIso) {
    return -1;
  }
  const start = new Date(`${week.startIso}T00:00:00.000Z`).getTime();
  const current = new Date(`${day}T00:00:00.000Z`).getTime();
  return Math.round((current - start) / (24 * 60 * 60 * 1000));
}

function dailyLoadHours(
  assignments: Assignment[],
  machineId: string,
  week: LockedWeek,
): number[] {
  const loads = [0, 0, 0, 0, 0, 0, 0];
  for (const assignment of assignments) {
    if (assignment.machineId !== machineId) continue;
    const day = dayIndexInWeek(vilniusDateIso(assignment.estimatedStart), week);
    if (day < 0 || day > 6) continue;
    loads[day] += assignment.durationHours;
  }
  return loads;
}

function formatMoveReason(move: Omit<TemporalMove, "reason">): string {
  return `Perkelta iš ${move.fromMachineCode} (${formatShortTime(move.fromStart)}) → ${move.toMachineCode} (${formatShortTime(move.toStart)}). Sureguliuoti ${move.fromWidthMm} → ${move.jobWidthMm} mm.`;
}

function formatShortTime(iso: string): string {
  const date = new Date(iso);
  const day = date.toLocaleDateString("lt-LT", {
    weekday: "short",
    timeZone: "Europe/Vilnius",
  });
  const time = date.toLocaleTimeString("lt-LT", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Vilnius",
  });
  return `${day} ${time}`;
}

/**
 * Move locked-week jobs from late slots on overloaded machines to earlier gaps.
 * Mutates assignments (machineId only); caller must reschedule lane times after.
 */
export function applyTemporalBalance(
  assignments: Assignment[],
  machines: TemporalMachine[],
  lockedWeek: LockedWeek,
): TemporalMove[] {
  const moves: TemporalMove[] = [];
  const machineById = new Map(machines.map((machine) => [machine.id, machine]));

  for (let pass = 0; pass < machines.length * 4; pass += 1) {
    const ranked = [...machines].sort((left, right) => {
      const leftLoad = dailyLoadHours(assignments, left.id, lockedWeek).reduce(
        (sum, hours) => sum + hours,
        0,
      );
      const rightLoad = dailyLoadHours(assignments, right.id, lockedWeek).reduce(
        (sum, hours) => sum + hours,
        0,
      );
      return rightLoad - leftLoad;
    });

    const donor = ranked[0];
    const receiver = ranked[ranked.length - 1];
    if (!donor || !receiver || donor.id === receiver.id) {
      break;
    }

    const donorLoads = dailyLoadHours(assignments, donor.id, lockedWeek);
    const receiverLoads = dailyLoadHours(assignments, receiver.id, lockedWeek);
    const donorTotal = donorLoads.reduce((sum, hours) => sum + hours, 0);
    const receiverTotal = receiverLoads.reduce((sum, hours) => sum + hours, 0);
    if (donorTotal - receiverTotal < DEFAULT_CHANGEOVER_MINUTES / 60) {
      break;
    }

    const donorJobs = assignments
      .filter((assignment) => assignment.machineId === donor.id)
      .sort(
        (left, right) => right.estimatedStart.getTime() - left.estimatedStart.getTime(),
      );

    const candidate = donorJobs.find((assignment) => {
      const pseudoReceiver = {
        id: receiver.id,
        currentWidthMm: receiver.currentWidthMm,
        dailyRatePieces: 240,
        changeoverMinutes: 30,
        assignedJobs: [],
      };
      const pseudoJob = {
        id: assignment.jobId,
        tileWidthMm: assignment.tileWidthMm,
        storisMm: assignment.storisMm,
        quantityPallets: assignment.quantityPallets,
        pieceCount: 1,
        deadline: "",
        cutType: "",
        proposalId: assignment.proposalId,
      };
      return isJobEligibleForMachine(pseudoReceiver, pseudoJob);
    });

    if (!candidate) {
      break;
    }

    const receiverDay = receiverLoads.findIndex((hours) => hours < donorTotal / 5);
    const donorDay = dayIndexInWeek(vilniusDateIso(candidate.estimatedStart), lockedWeek);
    if (receiverDay < 0 || donorDay < 0 || receiverDay >= donorDay) {
      break;
    }

    const fromMachine = machineById.get(donor.id)!;
    const toMachine = machineById.get(receiver.id)!;
    const moveBase = {
      jobId: candidate.jobId,
      fromMachineId: donor.id,
      toMachineId: receiver.id,
      fromMachineCode: fromMachine.code,
      toMachineCode: toMachine.code,
      fromWidthMm: fromMachine.currentWidthMm,
      toWidthMm: toMachine.currentWidthMm,
      jobWidthMm: candidate.tileWidthMm,
      fromStart: candidate.estimatedStart.toISOString(),
      toStart: candidate.estimatedStart.toISOString(),
    };
    const reason = formatMoveReason(moveBase);
    moves.push({ ...moveBase, reason });
    candidate.machineId = receiver.id;
  }

  return moves;
}

export function isTemporalMoveCompatible(
  receiverWidthMm: number,
  jobWidthMm: number,
): boolean {
  return isJobCompatibleWithStoredSetup(jobWidthMm, receiverWidthMm);
}
