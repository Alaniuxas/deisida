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
  value: string;
  catalog: Tile[];
  onChange: (tileId: string) => void;
  className?: string;
}

export function TileSearchSelect({
  value,
  catalog,
  onChange,
  className,
}: TileSearchSelectProps) {
  const [query, setQuery] = useState("");
  const selected = catalog.find((tile) => tile.id === value);

  useEffect(() => {
    if (selected) setQuery(selected.name);
  }, [selected?.id, selected?.name]);

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

  return (
    <div className="space-y-2">
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Ieškoti plytelės…"
        className={cn("h-10 bg-paper", className)}
      />
      <Select
        value={value}
        onValueChange={(tileId) => {
          if (tileId) onChange(tileId);
        }}
      >
        <SelectTrigger className={cn("h-10 bg-paper", className)}>
          <span className="truncate">{selected?.name ?? "Pasirinkite plytelę"}</span>
        </SelectTrigger>
        <SelectContent>
          {filtered.length === 0 ? (
            <SelectItem value="__empty" disabled>
              Nieko nerasta
            </SelectItem>
          ) : (
            filtered.map((tile) => (
              <SelectItem key={tile.id} value={tile.id}>
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
