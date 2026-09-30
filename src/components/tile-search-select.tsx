"use client";

import { useEffect, useMemo, useState } from "react";
import type { Tile } from "@/lib/types";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface TileSearchSelectProps {
  inputId: string;
  value: string;
  catalog: Tile[];
  onChange: (tileId: string) => void;
  className?: string;
}

export function TileSearchSelect({
  inputId,
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
    if (!trimmed) return catalog.slice(0, 80);
    return catalog
      .filter(
        (tile) =>
          tile.name.toLowerCase().includes(trimmed) ||
          tile.supplier.toLowerCase().includes(trimmed),
      )
      .slice(0, 80);
  }, [catalog, query]);

  const selectValue = value || "__unselected";

  return (
    <div className="space-y-2">
      <Input
        id={`${inputId}-search`}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Ieškoti plytelės…"
        className={cn("h-10 bg-paper", className)}
      />
      <Select
        value={selectValue}
        onValueChange={(tileId) => {
          if (!tileId || tileId === "__unselected") return;
          onChange(tileId);
        }}
      >
        <SelectTrigger
          id={inputId}
          aria-label="Pasirinkite plytelę"
          className={cn("h-10 bg-paper", className)}
        >
          <span className="truncate">
            {selected?.name ?? "Pasirinkite plytelę"}
          </span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__unselected" disabled>
            Pasirinkite plytelę
          </SelectItem>
          {filtered.length === 0 ? (
            <SelectItem value="__empty" disabled>
              Nieko nerasta
            </SelectItem>
          ) : (
            filtered.map((tile) => (
              <SelectItem key={`${inputId}-${tile.id}`} value={tile.id}>
                {tile.name}
                {tile.supplier ? ` · ${tile.supplier}` : ""}
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
    </div>
  );
}
