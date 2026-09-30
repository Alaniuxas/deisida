"use client";

import { useState } from "react";
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
  const options = catalog;

  return (
    <div className="space-y-2" data-tile-search={inputId}>
      <Input
        id={`${inputId}-search`}
        autoComplete="off"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Ieškoti plytelės…"
        className={cn("h-10 bg-paper", className)}
      />
      <select
        id={inputId}
        name={fieldName ?? inputId}
        form={form}
        defaultValue={value}
        data-line-tile={fieldName}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-paper px-3 text-sm",
          className,
        )}
      >
        <option value="">Pasirinkite plytelę</option>
        {options.map((tile) => (
          <option key={`${inputId}-${tile.id}`} value={tile.id}>
            {tile.name}
            {tile.supplier ? ` · ${tile.supplier}` : ""}
          </option>
        ))}
      </select>
    </div>
  );
}
