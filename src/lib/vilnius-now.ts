import { addCalendarDays } from "@/lib/queue/week";

const VILNIUS_TZ = "Europe/Vilnius";

export interface VilniusDateTimeParts {
  dateIso: string;
  time: string;
  hour: number;
  minute: number;
}

export function vilniusNowParts(now = new Date()): VilniusDateTimeParts {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: VILNIUS_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(now).map((part) => [part.type, part.value]),
  );
  const hour = Number(parts.hour);
  const minute = Number(parts.minute);
  return {
    dateIso: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    hour,
    minute,
  };
}

export function defaultDowntimeRange(now = new Date()): {
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
} {
  const current = vilniusNowParts(now);
  const endDate =
    current.hour >= 17 ? addCalendarDays(current.dateIso, 1) : current.dateIso;
  return {
    startDate: current.dateIso,
    startTime: current.time,
    endDate,
    endTime: "17:00",
  };
}
