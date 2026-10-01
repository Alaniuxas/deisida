export type CutType = string;

export type PickCriterion = "p1" | "p2" | "far" | "width" | "rate";

export type ClusterPriority = "P1" | "P2" | "P3";

export interface Machine {
  id: string;
  currentWidthMm: number;
  dailyRatePieces: number;
  changeoverMinutes: number;
  piecesPerDay?: number;
}

export interface QueueJob {
  id: string;
  tileWidthMm: number;
  storisMm: number;
  quantityPallets: number;
  pieceCount: number;
  deadline: Date | string;
  cutType: CutType;
  proposalId: string;
}

export interface Assignment {
  jobId: string;
  machineId: string;
  proposalId: string;
  cutType: CutType;
  tileWidthMm: number;
  storisMm: number;
  quantityPallets: number;
  durationHours: number;
  changeoverHours: number;
  estimatedStart: Date;
  estimatedEnd: Date;
  pickCriterion: PickCriterion;
  pickStartHours: number;
  otherMachineId: string | null;
  otherStartHours: number | null;
  priority: ClusterPriority;
}

import type { LockedWeek } from "./week";

export interface ScheduleOptions {
  referenceTime?: Date;
  lockedWeek?: LockedWeek;
  /** Spread locked-week work across Mon–Fri and balance machine load (default true when lockedWeek set). */
  balanceLockedWeek?: boolean;
}

export interface MachineDefaults {
  dailyRatePieces: number;
  changeoverMinutes: number;
  piecesPerDay?: number;
}
