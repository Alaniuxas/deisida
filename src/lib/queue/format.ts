const HOURS_PER_DAY = 24;

export function formatDurationHours(hours: number): string {
  if (hours < 1 / 60) return "< 1 min.";
  if (hours < 1) {
    const minutes = Math.round(hours * 60);
    return `${minutes} min.`;
  }
  if (hours < HOURS_PER_DAY) {
    const wholeHours = Math.floor(hours);
    const minutes = Math.round((hours - wholeHours) * 60);
    if (minutes === 0) return `${wholeHours} val.`;
    return `${wholeHours} val. ${minutes} min.`;
  }
  const days = Math.floor(hours / HOURS_PER_DAY);
  const remainderHours = Math.round(hours % HOURS_PER_DAY);
  if (remainderHours === 0) {
    return days === 1 ? "1 d." : `${days} d.`;
  }
  return `${days} d. ${remainderHours} val.`;
}

export function formatScheduleTimestamp(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("lt-LT", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDeadlineDate(deadline: string): string {
  const date = new Date(deadline);
  if (Number.isNaN(date.getTime())) return deadline;
  return date.toLocaleDateString("lt-LT", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
