import type { QueueJob } from "@/lib/production-types";
import {
  changeoverHoursFromSetup,
  nextSetupWidthAfterJob,
  requiresWidthChangeoverFromSetup,
} from "./machine-width";

export interface LaneWidthSegment {
  widthMm: number;
  jobs: QueueJob[];
  /** Plotis prieš šį bloką (admin arba ankstesnis segmentas). */
  fromWidthMm: number | null;
  requiresChangeover: boolean;
  changeoverMinutes: number;
  changeoverHours: number;
}

/** Grupuoja eilės darbus pagal plotį ir parodo, kur reikia operatoriaus reguliavimo. */
export function buildLaneWidthSegments(
  jobs: QueueJob[],
  storedWidthMm: number,
  defaultChangeoverMinutes: number,
): LaneWidthSegment[] {
  if (jobs.length === 0) {
    return [];
  }

  const segments: LaneWidthSegment[] = [];
  let setupWidthMm = storedWidthMm > 0 ? storedWidthMm : 0;

  for (const job of jobs) {
    const previous = segments[segments.length - 1];
    if (previous && previous.widthMm === job.widthMm) {
      previous.jobs.push(job);
      continue;
    }

    const fromWidthMm = setupWidthMm > 0 ? setupWidthMm : null;
    const requiresChangeover = requiresWidthChangeoverFromSetup(
      setupWidthMm,
      job.widthMm,
    );
    const changeoverHours = changeoverHoursFromSetup(
      setupWidthMm,
      job.widthMm,
      defaultChangeoverMinutes,
    );
    const changeoverMinutes = defaultChangeoverMinutes;

    segments.push({
      widthMm: job.widthMm,
      jobs: [job],
      fromWidthMm,
      requiresChangeover,
      changeoverMinutes,
      changeoverHours,
    });

    setupWidthMm = nextSetupWidthAfterJob(setupWidthMm, job.widthMm);
  }

  return segments;
}

export function formatChangeoverLabel(
  fromWidthMm: number | null,
  toWidthMm: number,
): string {
  const from =
    fromWidthMm != null && fromWidthMm > 0 ? `${fromWidthMm} mm` : "nereguliuota";
  return `${from} → ${toWidthMm} mm`;
}
