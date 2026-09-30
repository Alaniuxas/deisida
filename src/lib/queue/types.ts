export type CutType = string;

export interface Machine {
  id: string;
  currentWidthMm: number;
  dailyRatePieces: number;
  changeoverMinutes: number;
}

export interface QueueJob {
  id: string;
  tileWidthMm: number;
  quantityPieces: number;
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
  quantityPieces: number;
  durationHours: number;
  changeoverHours: number;
  estimatedStart: Date;
  estimatedEnd: Date;
}

export interface ScheduleOptions {
  referenceTime?: Date;
}

export interface MachineDefaults {
  dailyRatePieces: number;
  changeoverMinutes: number;
}
