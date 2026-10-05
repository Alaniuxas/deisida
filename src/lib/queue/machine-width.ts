export type MachineWidthSource = "stored" | "in_progress" | "queued" | "unset";

/** Admin-set machine width vs job width — same tolerance as load balancer. */
export const WIDTH_SETUP_TOLERANCE_MM = 5;
/**
 * If no machine is within ±5 mm, auto-plan prefers the nearest magnet up to
 * 15 mm (30 min changeover). Wider leftover still goes to the closest magnet
 * — any machine can cut any width; ±5 / ≤15 are priority bands, not a cap.
 * Rebalance / „Perskirstyti“ remain ±5 mm only. Rankinis perkėlimas visada
 * laimi ir nežiūri pločio.
 */
export const CHANGEOVER_ASSIGN_MAX_GAP_MM = 15;

export interface EffectiveMachineWidth {
  widthMm: number;
  source: MachineWidthSource;
}

export interface MachineWidthJob {
  status: string;
  widthMm: number;
}

export function getEffectiveMachineWidth(
  storedWidthMm: number | null | undefined,
  machineJobs: MachineWidthJob[],
): EffectiveMachineWidth {
  if (storedWidthMm != null && storedWidthMm > 0) {
    return { widthMm: storedWidthMm, source: "stored" };
  }

  const inProgress = machineJobs.find((job) => job.status === "in_progress");
  if (inProgress) {
    return { widthMm: inProgress.widthMm, source: "in_progress" };
  }

  const queued = machineJobs
    .filter((job) => job.status === "queued")
    .sort((left, right) => left.widthMm - right.widthMm);

  if (queued.length > 0) {
    return { widthMm: queued[0].widthMm, source: "queued" };
  }

  return { widthMm: 0, source: "unset" };
}

export function storedMachineWidth(
  storedWidthMm: number | null | undefined,
): number | null {
  return storedWidthMm != null && storedWidthMm > 0 ? storedWidthMm : null;
}

/** Preferred auto-plan match: job fits admin-set machine width (±5 mm). */
export function isJobCompatibleWithStoredSetup(
  jobWidthMm: number,
  storedWidthMm: number | null | undefined,
): boolean {
  const stored = storedMachineWidth(storedWidthMm);
  if (stored == null) {
    return true;
  }
  return Math.abs(stored - jobWidthMm) <= WIDTH_SETUP_TOLERANCE_MM;
}

/** Job is outside ±5 mm but close enough to assign with a changeover. */
export function isJobAssignableWithChangeover(
  jobWidthMm: number,
  storedWidthMm: number | null | undefined,
): boolean {
  const stored = storedMachineWidth(storedWidthMm);
  if (stored == null) {
    return false;
  }
  const gap = Math.abs(stored - jobWidthMm);
  return (
    gap > WIDTH_SETUP_TOLERANCE_MM && gap <= CHANGEOVER_ASSIGN_MAX_GAP_MM
  );
}

/** Pirmas darbas ant staklės: reguliavimas tik jei >±5 mm nuo admin nustatyto. */
export function requiresWidthChangeoverFromStoredSetup(
  storedWidthMm: number | null | undefined,
  jobWidthMm: number,
): boolean {
  const stored = storedMachineWidth(storedWidthMm);
  if (stored == null) {
    return false;
  }
  return Math.abs(stored - jobWidthMm) > WIDTH_SETUP_TOLERANCE_MM;
}

export function changeoverHoursFromStoredSetup(
  storedWidthMm: number | null | undefined,
  jobWidthMm: number,
  changeoverMinutes = 30,
): number {
  return requiresWidthChangeoverFromStoredSetup(storedWidthMm, jobWidthMm)
    ? changeoverMinutes / 60
    : 0;
}

/** Eilėje: reguliavimas tik jei darbo plotis >±5 mm nuo dabartinio operatoriaus nustatymo. */
export function requiresWidthChangeoverFromSetup(
  setupWidthMm: number | null | undefined,
  jobWidthMm: number,
): boolean {
  if (setupWidthMm == null || setupWidthMm <= 0) {
    return false;
  }
  return Math.abs(setupWidthMm - jobWidthMm) > WIDTH_SETUP_TOLERANCE_MM;
}

export function changeoverHoursFromSetup(
  setupWidthMm: number | null | undefined,
  jobWidthMm: number,
  changeoverMinutes = 30,
): number {
  return requiresWidthChangeoverFromSetup(setupWidthMm, jobWidthMm)
    ? changeoverMinutes / 60
    : 0;
}

/** Po darbo operatoriaus nustatymas keičiasi tik jei buvo reguliavimas. */
export function nextSetupWidthAfterJob(
  setupWidthMm: number,
  jobWidthMm: number,
): number {
  if (setupWidthMm <= 0) {
    return jobWidthMm;
  }
  return requiresWidthChangeoverFromSetup(setupWidthMm, jobWidthMm)
    ? jobWidthMm
    : setupWidthMm;
}

export function machineWidthLabel(width: EffectiveMachineWidth): string {
  if (width.source === "stored" && width.widthMm > 0) {
    return `Sureguliuota ${width.widthMm} mm`;
  }
  if (width.widthMm <= 0) {
    return "Plotis nereguliuotas";
  }
  return `Dabar ${width.widthMm} mm`;
}

export function machineWidthHint(width: EffectiveMachineWidth): string | null {
  switch (width.source) {
    case "stored":
      return "Admin nustatymas — keiskite /eile arba Konvejeriai";
    case "in_progress":
      return "Pagal aktyvų darbą konvejeryje";
    case "queued":
      return "Numatytas pagal eilę (ne reguliavimas)";
    default:
      return "Nustatykite plotį konvejerių ekrane";
  }
}
