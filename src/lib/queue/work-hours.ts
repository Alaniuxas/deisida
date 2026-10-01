import {
  VILNIUS_TZ,
  formatIsoDate,
  vilniusDateIso,
  zonedTimeToUtc,
} from "./week";

export const WORK_START_HOUR = 8;
export const WORK_END_HOUR = 17;
export const WORK_HOURS_PER_DAY = WORK_END_HOUR - WORK_START_HOUR;

const WEEKDAY_TO_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function zoneParts(date: Date) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: VILNIUS_TZ,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const mapped = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value]),
  );
  return {
    year: Number(mapped.year),
    month: Number(mapped.month),
    day: Number(mapped.day),
    hour: Number(mapped.hour),
    minute: Number(mapped.minute),
    weekday: mapped.weekday as string,
  };
}

function addCalendarDays(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day + days));
  return formatIsoDate(utc.getUTCFullYear(), utc.getUTCMonth() + 1, utc.getUTCDate());
}

function weekdayIndex(date: Date): number {
  return WEEKDAY_TO_INDEX[zoneParts(date).weekday] ?? 0;
}

export function isWeekend(date: Date): boolean {
  const day = weekdayIndex(date);
  return day === 0 || day === 6;
}

function workdayStartOnDate(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return zonedTimeToUtc(year, month, day, WORK_START_HOUR, 0);
}

/** Next Mon–Fri 08:00 strictly after the given instant (Vilnius). */
export function nextWorkdayStart(from: Date): Date {
  let iso = vilniusDateIso(from);
  let candidate = workdayStartOnDate(addCalendarDays(iso, 1));
  while (isWeekend(candidate)) {
    iso = vilniusDateIso(candidate);
    candidate = workdayStartOnDate(addCalendarDays(iso, 1));
  }
  return candidate;
}

/** Snap to the current or next in-window start (Mon–Fri 08:00–17:00 Vilnius). */
export function snapToWorkStart(date: Date): Date {
  if (isWeekend(date)) {
    return nextWorkdayStart(date);
  }

  const parts = zoneParts(date);
  const dayStart = zonedTimeToUtc(
    parts.year,
    parts.month,
    parts.day,
    WORK_START_HOUR,
    0,
  );
  const dayEnd = zonedTimeToUtc(
    parts.year,
    parts.month,
    parts.day,
    WORK_END_HOUR,
    0,
  );

  if (date.getTime() < dayStart.getTime()) {
    return dayStart;
  }
  if (date.getTime() >= dayEnd.getTime()) {
    return nextWorkdayStart(date);
  }
  return date;
}

export interface WorkDurationResult {
  start: Date;
  end: Date;
}

/** Schedule duration within 08:00–17:00 Mon–Fri; overflow continues next workday at 08:00. */
export function addWorkDuration(
  cursor: Date,
  durationHours: number,
): WorkDurationResult {
  const start = snapToWorkStart(cursor);
  let remaining = durationHours;
  let current = start;

  while (remaining > 1e-9) {
    if (isWeekend(current)) {
      current = nextWorkdayStart(current);
      continue;
    }

    const parts = zoneParts(current);
    const dayEnd = zonedTimeToUtc(
      parts.year,
      parts.month,
      parts.day,
      WORK_END_HOUR,
      0,
    );
    const hoursLeftToday = (dayEnd.getTime() - current.getTime()) / (60 * 60 * 1000);

    if (remaining <= hoursLeftToday + 1e-9) {
      return {
        start,
        end: new Date(current.getTime() + remaining * 60 * 60 * 1000),
      };
    }

    remaining -= hoursLeftToday;
    current = nextWorkdayStart(dayEnd);
  }

  return { start, end: current };
}

export function isWithinWorkHours(date: Date): boolean {
  if (isWeekend(date)) return false;
  const parts = zoneParts(date);
  const fractionalHour = parts.hour + parts.minute / 60;
  return fractionalHour >= WORK_START_HOUR && fractionalHour < WORK_END_HOUR;
}
