"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface StatisticsSearchOption {
  id: string;
  label: string;
}

interface StatisticsSearchSelectProps {
  id: string;
  label: string;
  placeholder: string;
  allLabel: string;
  options: StatisticsSearchOption[];
  value: string;
  onChange: (id: string) => void;
  maxResults?: number;
}

export function StatisticsSearchSelect({
  id,
  label,
  placeholder,
  allLabel,
  options,
  value,
  onChange,
  maxResults = 5,
}: StatisticsSearchSelectProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const selected = options.find((option) => option.id === value);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const pool = normalized
      ? options.filter((option) => option.label.toLowerCase().includes(normalized))
      : options;
    return pool.slice(0, maxResults);
  }, [maxResults, options, query]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
      {label}
      <div ref={rootRef} className="relative">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id={id}
            autoComplete="off"
            value={open ? query : selected?.label ?? ""}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
            }}
            onFocus={() => {
              setOpen(true);
              setQuery(selected?.label ?? "");
            }}
            placeholder={selected ? selected.label : placeholder}
            className="h-10 bg-paper pr-9 pl-9"
          />
          {value ? (
            <button
              type="button"
              aria-label={`${allLabel} — išvalyti`}
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted hover:text-ink"
              onClick={() => {
                onChange("");
                setQuery("");
                setOpen(false);
              }}
            >
              <X className="size-4" />
            </button>
          ) : null}
        </div>

        {open ? (
          <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-stone-line bg-paper shadow-lg">
            <button
              type="button"
              className={cn(
                "flex w-full px-3 py-2.5 text-left text-sm hover:bg-muted/60",
                !value && "bg-muted/40 font-medium",
              )}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange("");
                setQuery("");
                setOpen(false);
              }}
            >
              {allLabel}
            </button>
            {filtered.length > 0 ? (
              <ul className="border-t border-stone-line">
                {filtered.map((option) => (
                  <li key={option.id}>
                    <button
                      type="button"
                      className={cn(
                        "flex w-full px-3 py-2.5 text-left text-sm hover:bg-muted/60",
                        value === option.id && "bg-deisida/10 font-medium text-deisida",
                      )}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        onChange(option.id);
                        setQuery("");
                        setOpen(false);
                      }}
                    >
                      {option.label}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="border-t border-stone-line px-3 py-2.5 text-sm text-muted-foreground">
                Nieko nerasta. Bandykite kitą paiešką.
              </p>
            )}
            {options.length > maxResults && !query.trim() ? (
              <p className="border-t border-stone-line px-3 py-2 text-[11px] text-muted-foreground">
                Rodo iki {maxResults} rezultatų — įveskite paiešką, kad susiaurintumėte.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </label>
  );
}
