"use client";

import { useEffect, useMemo, useState } from "react";
import type { Tile } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface TileSearchSelectProps {
  inputId: string;
  fieldName?: string;
  form?: string;
  value: string;
  catalog: Tile[];
  onChange: (tileId: string) => void;
  className?: string;
}

export function TileSearchSelect({
  inputId,
  fieldName,
  form,
  value,
  catalog,
  onChange,
  className,
}: TileSearchSelectProps) {
  const [query, setQuery] = useState("");
  const selected = value ? catalog.find((tile) => tile.id === value) : undefined;

  useEffect(() => {
    setQuery(selected?.name ?? "");
  }, [inputId, selected?.id, selected?.name]);

  const filtered = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return catalog.slice(0, 120);
    return catalog
      .filter(
        (tile) =>
          tile.name.toLowerCase().includes(trimmed) ||
          tile.supplier.toLowerCase().includes(trimmed),
      )
      .slice(0, 120);
  }, [catalog, query]);

  return (
    <div className="space-y-2" data-tile-search={inputId}>
      <Input
        id={`${inputId}-search`}
        name={`${inputId}-search`}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Ieškoti plytelės…"
        autoComplete="off"
        className={cn("h-10 bg-paper", className)}
      />
      <select
        id={inputId}
        name={fieldName ?? inputId}
        form={form}
        value={value}
        onChange={(event) => {
          const tileId = event.target.value;
          if (tileId) onChange(tileId);
        }}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-paper px-3 text-sm",
          className,
        )}
      >
        <option value="">Pasirinkite plytelę</option>
        {filtered.map((tile) => (
          <option key={`${inputId}-${tile.id}`} value={tile.id}>
            {tile.name}
            {tile.supplier ? ` · ${tile.supplier}` : ""}
          </option>
        ))}
      </select>
    </div>
  );
}
