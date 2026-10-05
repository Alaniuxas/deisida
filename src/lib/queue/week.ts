export const VILNIUS_TZ = "Europe/Vilnius";

export interface LockedWeek {
  startIso: string;
  endIso: string;
}

interface ZoneParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: string;
}

const WEEKDAY_TO_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function zoneParts(date: Date, timeZone = VILNIUS_TZ): ZoneParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
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
    weekday: mapped.weekday,
  };
}

function weekdayIndex(date: Date): number {
  return WEEKDAY_TO_INDEX[zoneParts(date).weekday] ?? 0;
}

export function formatIsoDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function vilniusDateIso(date: Date): string {
  const parts = zoneParts(date);
  return formatIsoDate(parts.year, parts.month, parts.day);
}

export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  timeZone = VILNIUS_TZ,
): Date {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  let date = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  for (let i = 0; i < 4; i += 1) {
    const mapped = Object.fromEntries(
      formatter.formatToParts(date).map((part) => [part.type, part.value]),
    );
    const got = Date.UTC(
      Number(mapped.year),
      Number(mapped.month) - 1,
      Number(mapped.day),
      Number(mapped.hour),
      Number(mapped.minute),
      Number(mapped.second),
    );
    const wanted = Date.UTC(year, month - 1, day, hour, minute, 0);
    date = new Date(date.getTime() + (wanted - got));
  }
  return date;
}

export function addCalendarDays(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day + days));
  return formatIsoDate(utc.getUTCFullYear(), utc.getUTCMonth() + 1, utc.getUTCDate());
}

/** Friday 00:00 Europe/Vilnius that this planner run represents. */
export function plannerFridayMidnight(now = new Date()): Date {
  const parts = zoneParts(now);
  const weekday = WEEKDAY_TO_INDEX[parts.weekday] ?? 0;
  const daysUntilFriday = (5 - weekday + 7) % 7;
  const fridayIso =
    daysUntilFriday === 0
      ? formatIsoDate(parts.year, parts.month, parts.day)
      : addCalendarDays(formatIsoDate(parts.year, parts.month, parts.day), daysUntilFriday);
  const [year, month, day] = fridayIso.split("-").map(Number);
  return zonedTimeToUtc(year, month, day, 0, 0);
}

/**
 * After Friday 00:00 Vilnius, the locked plan covers the following
 * production week Mon–Fri (pjovimo pradžios iki penktadienio vakaro).
 * Pabaiga gali persikelti į kitą savaitę (valandinis pjovimo grafikas).
 */
export function lockedWeekAfterFriday(friday: Date): LockedWeek {
  const fridayIso = vilniusDateIso(friday);
  const startIso = addCalendarDays(fridayIso, 3);
  const endIso = addCalendarDays(startIso, 4);
  return { startIso, endIso };
}

export function lockedWeekForPlanner(now = new Date()): LockedWeek {
  return lockedWeekAfterFriday(plannerFridayMidnight(now));
}

export function isDateInLockedWeek(isoDate: string, week: LockedWeek): boolean {
  const day = isoDate.slice(0, 10);
  return day >= week.startIso && day <= week.endIso;
}

export function isTimestampInLockedWeek(
  value: Date | string,
  week: LockedWeek,
): boolean {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return isDateInLockedWeek(vilniusDateIso(date), week);
}

function isWeekendDate(date: Date): boolean {
  const weekday = WEEKDAY_TO_INDEX[zoneParts(date).weekday] ?? 0;
  return weekday === 0 || weekday === 6;
}

/** Ar darbo pradžia patenka į užrakintą gamybos savaitę (pr–pn, ne savaitgalis). */
export function isJobStartInLockedPlanWeek(
  value: Date | string,
  week: LockedWeek,
): boolean {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  if (!isDateInLockedWeek(vilniusDateIso(date), week)) {
    return false;
  }
  return !isWeekendDate(date);
}

export function formatLockedWeekLabel(week: LockedWeek): string {
  const start = week.startIso.split("-").reverse().join(".");
  const end = week.endIso.split("-").reverse().join(".");
  return `${start} – ${end}`;
}

/** Paskutinė užrakintos savaitės darbo diena (pn) 17:00 Europe/Vilnius. */
export function lockedWeekFridayEnd(week: LockedWeek): Date {
  const [year, month, day] = week.endIso.split("-").map(Number);
  return zonedTimeToUtc(year, month, day, 17, 0);
}
