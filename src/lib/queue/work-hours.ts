import {
  VILNIUS_TZ,
  formatIsoDate,
  vilniusDateIso,
  zonedTimeToUtc,
} from "./week";

export const WORK_START_HOUR = 8;
export const WORK_BREAK_START_HOUR = 12;
export const WORK_BREAK_END_HOUR = 13;
export const WORK_END_HOUR = 17;
/** Productive hours per day: 08–12 + 13–17 (1 h lunch at 12:00). */
export const WORK_HOURS_PER_DAY =
  WORK_BREAK_START_HOUR -
  WORK_START_HOUR +
  (WORK_END_HOUR - WORK_BREAK_END_HOUR);

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

function fractionalHour(parts: ReturnType<typeof zoneParts>): number {
  return parts.hour + parts.minute / 60;
}

function addCalendarDays(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day + days));
  return formatIsoDate(utc.getUTCFullYear(), utc.getUTCMonth() + 1, utc.getUTCDate());
}

function weekdayIndex(date: Date): number {
  return WEEKDAY_TO_INDEX[zoneParts(date).weekday] ?? 0;
}

function dayWorkEnd(parts: Pick<ReturnType<typeof zoneParts>, "year" | "month" | "day">): Date {
  return zonedTimeToUtc(parts.year, parts.month, parts.day, WORK_END_HOUR, 0);
}

export function isWeekend(date: Date): boolean {
  const day = weekdayIndex(date);
  return day === 0 || day === 6;
}

export function isDuringLunchBreak(date: Date): boolean {
  if (isWeekend(date)) {
    return false;
  }
  const fractional = fractionalHour(zoneParts(date));
  return (
    fractional >= WORK_BREAK_START_HOUR && fractional < WORK_BREAK_END_HOUR
  );
}

function workdayStartOnDate(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return zonedTimeToUtc(year, month, day, WORK_START_HOUR, 0);
}

function skipLunchBreak(date: Date): Date {
  if (!isDuringLunchBreak(date)) {
    return date;
  }
  const parts = zoneParts(date);
  return zonedTimeToUtc(
    parts.year,
    parts.month,
    parts.day,
    WORK_BREAK_END_HOUR,
    0,
  );
}

function productiveHoursLeftToday(current: Date): number {
  if (isWeekend(current)) {
    return 0;
  }

  const parts = zoneParts(current);
  const fractional = fractionalHour(parts);
  if (fractional < WORK_START_HOUR) {
    return WORK_HOURS_PER_DAY;
  }
  if (fractional >= WORK_END_HOUR) {
    return 0;
  }
  if (fractional < WORK_BREAK_START_HOUR) {
    return (
      WORK_BREAK_START_HOUR -
      fractional +
      (WORK_END_HOUR - WORK_BREAK_END_HOUR)
    );
  }
  if (fractional < WORK_BREAK_END_HOUR) {
    return WORK_END_HOUR - WORK_BREAK_END_HOUR;
  }
  return WORK_END_HOUR - fractional;
}

function productiveHoursBetweenFractions(
  fromFh: number,
  untilFh: number,
): number {
  if (untilFh <= fromFh) {
    return 0;
  }

  let total = 0;
  const morningStart = Math.max(fromFh, WORK_START_HOUR);
  const morningEnd = Math.min(untilFh, WORK_BREAK_START_HOUR);
  if (morningStart < morningEnd) {
    total += morningEnd - morningStart;
  }

  const afternoonStart = Math.max(fromFh, WORK_BREAK_END_HOUR);
  const afternoonEnd = Math.min(untilFh, WORK_END_HOUR);
  if (afternoonStart < afternoonEnd) {
    total += afternoonEnd - afternoonStart;
  }

  return total;
}

function addProductionHoursWithinDay(current: Date, hours: number): Date {
  let remainingMs = hours * 60 * 60 * 1000;
  let cursor = skipLunchBreak(current);

  while (remainingMs > 0) {
    if (isWeekend(cursor)) {
      cursor = nextWorkdayStart(cursor);
      continue;
    }

    const parts = zoneParts(cursor);
    const dayStart = zonedTimeToUtc(
      parts.year,
      parts.month,
      parts.day,
      WORK_START_HOUR,
      0,
    );
    const lunchStart = zonedTimeToUtc(
      parts.year,
      parts.month,
      parts.day,
      WORK_BREAK_START_HOUR,
      0,
    );
    const lunchEnd = zonedTimeToUtc(
      parts.year,
      parts.month,
      parts.day,
      WORK_BREAK_END_HOUR,
      0,
    );
    const dayEnd = dayWorkEnd(parts);

    if (cursor.getTime() < dayStart.getTime()) {
      cursor = dayStart;
    }

    if (cursor.getTime() < lunchStart.getTime()) {
      const available = lunchStart.getTime() - cursor.getTime();
      if (remainingMs <= available) {
        return new Date(cursor.getTime() + remainingMs);
      }
      remainingMs -= available;
      cursor = lunchEnd;
      continue;
    }

    if (cursor.getTime() < lunchEnd.getTime()) {
      cursor = lunchEnd;
      continue;
    }

    const available = dayEnd.getTime() - cursor.getTime();
    if (remainingMs <= available) {
      return new Date(cursor.getTime() + remainingMs);
    }
    remainingMs -= available;
    cursor = nextWorkdayStart(dayEnd);
  }

  return cursor;
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

/** Snap to the current or next productive instant (Mon–Fri 08–12 / 13–17 Vilnius). */
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
  const dayEnd = dayWorkEnd(parts);

  if (date.getTime() < dayStart.getTime()) {
    return dayStart;
  }
  if (date.getTime() >= dayEnd.getTime()) {
    return nextWorkdayStart(date);
  }
  if (isDuringLunchBreak(date)) {
    return zonedTimeToUtc(
      parts.year,
      parts.month,
      parts.day,
      WORK_BREAK_END_HOUR,
      0,
    );
  }
  return date;
}

export interface WorkDurationResult {
  start: Date;
  end: Date;
}

/** Productive hours between two instants (pn–pn, lunch excluded). */
export function workHoursUntil(from: Date, until: Date): number {
  if (until.getTime() <= from.getTime()) {
    return 0;
  }

  let total = 0;
  let current = snapToWorkStart(from);

  while (current.getTime() < until.getTime()) {
    if (isWeekend(current)) {
      current = nextWorkdayStart(current);
      continue;
    }

    current = skipLunchBreak(current);
    const parts = zoneParts(current);
    const dayEnd = dayWorkEnd(parts);
    const sliceEnd =
      dayEnd.getTime() < until.getTime() ? dayEnd : until;
    total += productiveHoursBetweenFractions(
      fractionalHour(zoneParts(current)),
      fractionalHour(zoneParts(sliceEnd)),
    );
    if (sliceEnd.getTime() >= until.getTime()) {
      break;
    }
    current = nextWorkdayStart(dayEnd);
  }

  return total;
}

/** Productive hours spanned by a stored plan interval (not wall-clock end−start). */
export function durationHoursFromPlan(
  start: Date | string,
  end: Date | string,
): number {
  const from = start instanceof Date ? start : new Date(start);
  const until = end instanceof Date ? end : new Date(end);
  if (Number.isNaN(from.getTime()) || Number.isNaN(until.getTime())) {
    return 0.01;
  }
  return Math.max(workHoursUntil(from, until), 0.01);
}

/**
 * Schedule production duration within Mon–Fri 08–12 / 13–17 Vilnius;
 * overflow continues next workday at 08:00.
 */
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

    current = skipLunchBreak(current);
    const leftToday = productiveHoursLeftToday(current);

    if (remaining <= leftToday + 1e-9) {
      return {
        start,
        end: addProductionHoursWithinDay(current, remaining),
      };
    }

    remaining -= leftToday;
    current = nextWorkdayStart(dayWorkEnd(zoneParts(current)));
  }

  return { start, end: current };
}

/** Advance by productive hours (e.g. changeover before cutting). */
export function advanceWorkHours(from: Date, hours: number): Date {
  return addWorkDuration(from, hours).end;
}

export function isWithinWorkHours(date: Date): boolean {
  if (isWeekend(date)) return false;
  if (isDuringLunchBreak(date)) return false;
  const fractional = fractionalHour(zoneParts(date));
  return fractional >= WORK_START_HOUR && fractional < WORK_END_HOUR;
}
