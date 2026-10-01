import { addDays, format, getDay, parseISO } from "date-fns";

export function formatDateIso(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

export function parseDateIso(isoDate: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (match) {
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }
  return parseISO(isoDate);
}

/** Penktadienis (0=Sun … 5=Fri) — sekantis arba tas pats, jei jau penktadienis. */
export function nextFridayFrom(date: Date): Date {
  const day = getDay(date);
  const daysUntilFriday = day <= 5 ? 5 - day : 7 - day + 5;
  return addDays(date, daysUntilFriday === 0 ? 7 : daysUntilFriday);
}

export function isDateInPeriod(
  dateIso: string,
  startIso: string,
  endIso: string,
): boolean {
  return dateIso >= startIso && dateIso <= endIso;
}

export function todayIso(): string {
  return formatDateIso(new Date());
}
