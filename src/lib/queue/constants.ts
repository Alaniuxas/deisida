import type { Machine, MachineDefaults } from "./types";

export const DEFAULT_CHANGEOVER_MINUTES = 30;
export const DEFAULT_ROTATION_HOURS = 4;

export const KNEW_MACHINE_DEFAULTS: MachineDefaults = {
  dailyRatePieces: 720,
  changeoverMinutes: DEFAULT_CHANGEOVER_MINUTES,
};

export const KONV_MACHINE_DEFAULTS: MachineDefaults = {
  dailyRatePieces: 240,
  changeoverMinutes: DEFAULT_CHANGEOVER_MINUTES,
};

export interface DefaultMachineSeed {
  id: string;
  currentWidthMm: number;
}

export const DEFAULT_MACHINE_SEEDS: DefaultMachineSeed[] = [
  { id: "KNEW", currentWidthMm: 0 },
  { id: "KONV", currentWidthMm: 0 },
];

export function createDefaultMachines(
  seeds: DefaultMachineSeed[] = DEFAULT_MACHINE_SEEDS,
): Machine[] {
  return seeds.map((seed) => {
    const defaults =
      seed.id === "KNEW" ? KNEW_MACHINE_DEFAULTS : KONV_MACHINE_DEFAULTS;

    return {
      id: seed.id,
      currentWidthMm: seed.currentWidthMm,
      dailyRatePieces: defaults.dailyRatePieces,
      changeoverMinutes: defaults.changeoverMinutes,
    };
  });
}
