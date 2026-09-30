export type MachineWidthSource = "stored" | "in_progress" | "queued" | "unset";

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

export function machineWidthLabel(width: EffectiveMachineWidth): string {
  if (width.widthMm <= 0) {
    return "Plotis nereguliuotas";
  }
  return `Dabar ${width.widthMm} mm`;
}

export function machineWidthHint(width: EffectiveMachineWidth): string | null {
  switch (width.source) {
    case "stored":
      return "Išsaugotas admin nustatymas";
    case "in_progress":
      return "Pagal aktyvų darbą konvejeryje";
    case "queued":
      return "Pagal artimiausią darbą eilėje";
    default:
      return null;
  }
}
