import type { Machine, MachineDefaults } from "./types";

export const DEFAULT_CHANGEOVER_MINUTES = 30;
export const DEFAULT_ROTATION_HOURS = 4;
export const SHIFT_HOURS = 8;

/** Empty machine only takes a width this far from a busy machine's current mm. */
export const EMPTY_MACHINE_MIN_DISTANCE_MM = 20;

export const SHOP_MACHINE_ORDER = ["NK1", "NK2", "S1", "S2", "S4", "SK1"] as const;

export type ShopMachineCode = (typeof SHOP_MACHINE_ORDER)[number];

export const KNEW_MACHINE_DEFAULTS: MachineDefaults = {
  dailyRatePieces: 720,
  changeoverMinutes: DEFAULT_CHANGEOVER_MINUTES,
  piecesPerDay: 8000,
};

export const KONV_MACHINE_DEFAULTS: MachineDefaults = {
  dailyRatePieces: 240,
  changeoverMinutes: DEFAULT_CHANGEOVER_MINUTES,
  piecesPerDay: 2500,
};

export interface DefaultMachineSeed {
  id: string;
  currentWidthMm: number;
  piecesPerDay?: number;
  dailyRatePieces?: number;
}

export const DEFAULT_MACHINE_SEEDS: DefaultMachineSeed[] = [
  { id: "NK1", currentWidthMm: 0, dailyRatePieces: 720, piecesPerDay: 8000 },
  { id: "NK2", currentWidthMm: 0, dailyRatePieces: 720, piecesPerDay: 1000 },
  { id: "S1", currentWidthMm: 0, dailyRatePieces: 240, piecesPerDay: 3500 },
];

export function createDefaultMachines(
  seeds: DefaultMachineSeed[] = DEFAULT_MACHINE_SEEDS,
): Machine[] {
  return seeds.map((seed) => ({
    id: seed.id,
    currentWidthMm: seed.currentWidthMm,
    dailyRatePieces: seed.dailyRatePieces ?? 240,
    changeoverMinutes: DEFAULT_CHANGEOVER_MINUTES,
    piecesPerDay: seed.piecesPerDay,
  }));
}
