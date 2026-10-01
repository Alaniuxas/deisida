"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { lt } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  formatIsoDateLocal,
  parseLocalIsoDate,
} from "@/lib/proposal-utils";
import { cn } from "@/lib/utils";

export function formatLtDisplayDate(isoDate: string): string {
  if (!isoDate) return "Pasirinkite datą";
  try {
    return format(parseLocalIsoDate(isoDate), "yyyy 'm.' MMMM d 'd.'", {
      locale: lt,
    });
  } catch {
    return isoDate;
  }
}

interface LithuanianDatePickerProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function LithuanianDatePicker({
  id,
  value,
  onChange,
  placeholder = "Pasirinkite datą",
}: LithuanianDatePickerProps) {
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => {
    if (!value) return undefined;
    try {
      return parseLocalIsoDate(value);
    } catch {
      return undefined;
    }
  }, [value]);

  const currentYear = new Date().getFullYear();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        id={id}
        type="button"
        className={cn(
          "inline-flex h-10 w-full items-center justify-start rounded-md border border-stone-line bg-paper px-3 text-left text-sm font-normal transition-colors outline-none hover:bg-[#f3f3f0] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
          !value && "text-muted-foreground",
        )}
      >
        <CalendarIcon className="mr-2 size-4 shrink-0 opacity-60" />
        <span className="truncate">
          {value ? formatLtDisplayDate(value) : placeholder}
        </span>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start" sideOffset={6}>
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(date) => {
            if (date) {
              onChange(formatIsoDateLocal(date));
              setOpen(false);
            }
          }}
          locale={lt}
          weekStartsOn={1}
          captionLayout="dropdown"
          startMonth={new Date(currentYear - 1, 0)}
          endMonth={new Date(currentYear + 5, 11)}
          defaultMonth={selected}
          className="p-3"
        />
      </PopoverContent>
    </Popover>
  );
}
