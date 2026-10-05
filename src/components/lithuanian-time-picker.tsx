"use client";

import { cn } from "@/lib/utils";

const HOURS = Array.from({ length: 24 }, (_, index) =>
  String(index).padStart(2, "0"),
);
const MINUTES = Array.from({ length: 60 }, (_, index) =>
  String(index).padStart(2, "0"),
);

function parseTime(value: string): { hour: string; minute: string } {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) {
    return { hour: "08", minute: "00" };
  }
  const hour = Math.min(23, Math.max(0, Number(match[1])));
  const minute = Math.min(59, Math.max(0, Number(match[2])));
  return {
    hour: String(hour).padStart(2, "0"),
    minute: String(minute).padStart(2, "0"),
  };
}

interface LithuanianTimePickerProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

const selectClassName =
  "h-10 min-w-0 flex-1 rounded-md border border-stone-line bg-paper px-2 text-sm tabular-nums outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function LithuanianTimePicker({
  id,
  value,
  onChange,
  className,
}: LithuanianTimePickerProps) {
  const { hour, minute } = parseTime(value);

  const update = (nextHour: string, nextMinute: string) => {
    onChange(`${nextHour}:${nextMinute}`);
  };

  return (
    <div id={id} className={cn("flex items-center gap-1", className)}>
      <select
        aria-label="Valanda"
        value={hour}
        onChange={(event) => update(event.target.value, minute)}
        className={selectClassName}
      >
        {HOURS.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <span className="text-sm font-medium text-muted-foreground">:</span>
      <select
        aria-label="Minutė"
        value={minute}
        onChange={(event) => update(hour, event.target.value)}
        className={selectClassName}
      >
        {MINUTES.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );
}
