import { formatIsoDateLocal } from "@/lib/proposal-utils";
import { WORK_HOURS_PER_DAY } from "./work-hours";

/** Format productive hours (1 d. = 8 val. gamybos, ne 24 h kalendorinių). */
export function formatDurationHours(hours: number): string {
  if (hours < 1 / 60) return "< 1 min.";
  if (hours < 1) {
    const minutes = Math.round(hours * 60);
    return `${minutes} min.`;
  }
  if (hours < WORK_HOURS_PER_DAY) {
    const wholeHours = Math.floor(hours);
    const minutes = Math.round((hours - wholeHours) * 60);
    if (minutes === 0) return `${wholeHours} val.`;
    return `${wholeHours} val. ${minutes} min.`;
  }
  const days = Math.floor(hours / WORK_HOURS_PER_DAY);
  const remainderHours = Math.round(hours % WORK_HOURS_PER_DAY);
  if (remainderHours === 0) {
    return days === 1 ? "1 d." : `${days} d.`;
  }
  return `${days} d. ${remainderHours} val.`;
}

export function formatScheduleTimestamp(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("lt-LT", {
    timeZone: "Europe/Vilnius",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatScheduleTimestampFull(
  value: string | Date,
  options?: { withSeconds?: boolean },
): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("lt-LT", {
    timeZone: "Europe/Vilnius",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    ...(options?.withSeconds ? { second: "2-digit" } : {}),
  });
}

export function formatScheduleEndpoints(
  start: string | Date,
  end: string | Date,
): { start: string; end: string } {
  const startDate = start instanceof Date ? start : new Date(start);
  const endDate = end instanceof Date ? end : new Date(end);
  return {
    start: formatScheduleTimestampFull(startDate, { withSeconds: true }),
    end: formatScheduleTimestampFull(endDate, { withSeconds: true }),
  };
}

export function formatDeadlineDate(deadline: string): string {
  const date = new Date(deadline);
  if (Number.isNaN(date.getTime()) || date.getFullYear() < 1980) return "—";
  return date.toLocaleDateString("lt-LT", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/** Terminas formoje — ne ankstesnis už šiandieną ar planuojamą pabaigą. */
export function effectiveCutByDeadline(
  deadline: string,
  plannedEnd?: string | null,
  now = new Date(),
): string {
  const today = formatIsoDateLocal(now);
  let iso = deadline.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return today;
  if (iso < today) iso = today;
  if (plannedEnd) {
    const finishDay = plannedEnd.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(finishDay) && finishDay > iso) {
      iso = finishDay;
    }
  }
  return iso;
}

export function isDeadlineStaleInPlan(
  deadline: string,
  plannedEnd?: string | null,
  now = new Date(),
): boolean {
  return deadline.slice(0, 10) !== effectiveCutByDeadline(deadline, plannedEnd, now);
}

/** Pjovimo terminas kaip ISO — pn 17:00 Vilnius. */
export function cutByIsoFromDate(isoDate: string): string {
  const day = isoDate.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return isoDate;
  return `${day}T17:00:00+03:00`;
}

/** Pabaigos laikas konvejerio pasiūlymuose — ne rodo epoch (1970). */
export function formatScheduleFinishLabel(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime()) || date.getFullYear() < 1980) return "—";
  return formatScheduleTimestampFull(date);
}
