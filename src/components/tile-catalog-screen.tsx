"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { DiscCatalogSection } from "@/components/disc-catalog-section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCatalogPrice } from "@/lib/proposal-utils";
import type { Disc, Tile } from "@/lib/types";

function parsePriceInput(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return 0;
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

interface TileFormState {
  name: string;
  supplier: string;
  lengthMm: string;
  widthMm: string;
  heightMm: string;
  priceEur: string;
  discId: string;
  hardness: string;
  fragilityStrip: string;
  fragilityCorner: string;
}

function emptyTileForm(): TileFormState {
  return {
    name: "",
    supplier: "",
    lengthMm: "",
    widthMm: "",
    heightMm: "",
    priceEur: "",
    discId: "",
    hardness: "",
    fragilityStrip: "",
    fragilityCorner: "",
  };
}

function tileToForm(tile: Tile): TileFormState {
  return {
    name: tile.name,
    supplier: tile.supplier,
    lengthMm: String(tile.lengthMm),
    widthMm: String(tile.widthMm),
    heightMm: String(tile.heightMm),
    priceEur: tile.priceEur ? String(tile.priceEur) : "",
    discId: tile.discId ?? "",
    hardness: tile.hardness !== undefined ? String(tile.hardness) : "",
    fragilityStrip: tile.fragilityStrip?.replace("%", "") ?? "",
    fragilityCorner: tile.fragilityCorner?.replace("%", "") ?? "",
  };
}

interface TileCatalogScreenProps {
  tiles: Tile[];
  discs: Disc[];
}

export function TileCatalogScreen({ tiles, discs }: TileCatalogScreenProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState<TileFormState>(emptyTileForm());

  function resetForm() {
    setForm(emptyTileForm());
    setEditingId(null);
    setError(null);
  }

  function startCreate() {
    resetForm();
    setOpen(true);
    setMessage(null);
  }

  function startEdit(tile: Tile) {
    setEditingId(tile.id);
    setForm(tileToForm(tile));
    setOpen(true);
    setError(null);
    setMessage(null);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    const parsedLength = Number.parseInt(form.lengthMm.trim(), 10);
    const parsedWidth = Number.parseInt(form.widthMm.trim(), 10);
    const parsedHeight = Number.parseInt(form.heightMm.trim(), 10);
    const parsedPrice = parsePriceInput(form.priceEur);
    const parsedHardness = form.hardness.trim()
      ? Number.parseInt(form.hardness.trim(), 10)
      : null;

    if (!form.name.trim()) {
      setError("Įveskite plytelės pavadinimą.");
      return;
    }
    if (
      !Number.isFinite(parsedLength) ||
      !Number.isFinite(parsedWidth) ||
      !Number.isFinite(parsedHeight) ||
      parsedLength <= 0 ||
      parsedWidth <= 0 ||
      parsedHeight <= 0
    ) {
      setError("Matmenys ir storis turi būti teigiami sveikieji skaičiai.");
      return;
    }
    if (parsedPrice === null || parsedPrice < 0) {
      setError("Kaina turi būti nulis arba teigiamas skaičius.");
      return;
    }
    if (parsedHardness !== null && (!Number.isFinite(parsedHardness) || parsedHardness < 1)) {
      setError("Kietumas turi būti teigiamas skaičius.");
      return;
    }

    const payload = {
      name: form.name.trim(),
      supplier: form.supplier.trim(),
      lengthMm: parsedLength,
      widthMm: parsedWidth,
      heightMm: parsedHeight,
      priceEur: parsedPrice,
      discId: form.discId || null,
      hardness: parsedHardness,
      fragilityStrip: form.fragilityStrip.trim() ? form.fragilityStrip.trim() : null,
      fragilityCorner: form.fragilityCorner.trim() ? form.fragilityCorner.trim() : null,
    };

    setSaving(true);
    try {
      const response = await fetch(editingId ? `/api/tiles/${editingId}` : "/api/tiles", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await response.json()) as { error?: string; tile?: Tile };
      if (!response.ok) {
        throw new Error(data.error ?? "Nepavyko išsaugoti plytelės.");
      }

      setMessage(
        editingId
          ? `Plytelė „${data.tile?.name ?? form.name.trim()}“ atnaujinta.`
          : `Plytelė „${data.tile?.name ?? form.name.trim()}“ pridėta į katalogą.`,
      );
      resetForm();
      setOpen(false);
      router.refresh();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Nepavyko išsaugoti plytelės.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 lg:px-10">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-deisida-muted">Plytelių baras</h1>
          <p className="mt-1 text-muted-foreground">
            Kataloge {tiles.length} plytelių ir {discs.length} diskų
          </p>
        </div>
        <Link
          href="/pasiulymai/naujas"
          className="inline-flex h-10 items-center rounded-md bg-deisida px-4 text-sm font-medium text-deisida-foreground hover:bg-deisida/90"
        >
          Naujas pasiūlymas
        </Link>
      </div>

      <Tabs defaultValue="tiles">
        <TabsList variant="line" className="mb-6">
          <TabsTrigger value="tiles">Plytelės</TabsTrigger>
          <TabsTrigger value="discs">Diskai</TabsTrigger>
        </TabsList>

        <TabsContent value="tiles">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Plytelės su disko, kietumo ir broko informacija iš archyvo.
            </p>
            <Button
              type="button"
              variant="outline"
              className="h-10 border-stone-line px-4"
              onClick={() => {
                if (open) {
                  setOpen(false);
                  resetForm();
                  return;
                }
                startCreate();
              }}
            >
              {open ? "Atšaukti" : "Pridėti plytelę"}
            </Button>
          </div>

          {message ? <p className="mb-3 text-sm font-medium text-deisida">{message}</p> : null}

          {open ? (
            <form
              onSubmit={handleSubmit}
              className="mb-4 rounded-xl border border-stone-line bg-[#f3f3f0] p-4"
            >
              <p className="mb-4 text-sm font-semibold text-deisida-muted">
                {editingId ? "Redaguoti plytelę" : "Nauja plytelė kataloge"}
              </p>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="sm:col-span-2 lg:col-span-1">
                  <Label htmlFor="tile-name">Plytelė</Label>
                  <Input
                    id="tile-name"
                    value={form.name}
                    onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                    className="mt-1.5 h-10 bg-paper"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="tile-supplier">Tiekėjas</Label>
                  <Input
                    id="tile-supplier"
                    value={form.supplier}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, supplier: event.target.value }))
                    }
                    className="mt-1.5 h-10 bg-paper"
                  />
                </div>
                <div>
                  <Label>Diskas</Label>
                  <Select
                    value={form.discId || "none"}
                    onValueChange={(value) =>
                      setForm((current) => ({
                        ...current,
                        discId: value === "none" ? "" : value,
                      }))
                    }
                  >
                    <SelectTrigger className="mt-1.5 h-10 bg-paper">
                      <SelectValue placeholder="Pasirinkite diską" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Be disko</SelectItem>
                      {discs.map((disc) => (
                        <SelectItem key={disc.id} value={disc.id}>
                          {disc.name}
                          {disc.diameterMm ? ` · Ø${disc.diameterMm} mm` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="tile-length">Ilgis (mm)</Label>
                  <Input
                    id="tile-length"
                    type="number"
                    min={1}
                    value={form.lengthMm}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, lengthMm: event.target.value }))
                    }
                    className="mt-1.5 h-10 bg-paper"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="tile-width">Plotis (mm)</Label>
                  <Input
                    id="tile-width"
                    type="number"
                    min={1}
                    value={form.widthMm}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, widthMm: event.target.value }))
                    }
                    className="mt-1.5 h-10 bg-paper"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="tile-height">Storis (mm)</Label>
                  <Input
                    id="tile-height"
                    type="number"
                    min={1}
                    value={form.heightMm}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, heightMm: event.target.value }))
                    }
                    className="mt-1.5 h-10 bg-paper"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="tile-price">Kaina (€)</Label>
                  <Input
                    id="tile-price"
                    value={form.priceEur}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, priceEur: event.target.value }))
                    }
                    className="mt-1.5 h-10 bg-paper"
                  />
                </div>
                <div>
                  <Label htmlFor="tile-hardness">Kietumas</Label>
                  <Input
                    id="tile-hardness"
                    type="number"
                    min={1}
                    value={form.hardness}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, hardness: event.target.value }))
                    }
                    className="mt-1.5 h-10 bg-paper"
                  />
                </div>
                <div>
                  <Label htmlFor="tile-fragility-strip">Brokas juostoje (%)</Label>
                  <Input
                    id="tile-fragility-strip"
                    value={form.fragilityStrip}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, fragilityStrip: event.target.value }))
                    }
                    className="mt-1.5 h-10 bg-paper"
                  />
                </div>
                <div>
                  <Label htmlFor="tile-fragility-corner">Brokas kampuose (%)</Label>
                  <Input
                    id="tile-fragility-corner"
                    value={form.fragilityCorner}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, fragilityCorner: event.target.value }))
                    }
                    className="mt-1.5 h-10 bg-paper"
                  />
                </div>
              </div>

              {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}

              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  type="submit"
                  disabled={saving}
                  className="h-10 bg-deisida px-4 text-deisida-foreground hover:bg-deisida/90"
                >
                  {saving ? "Saugoma…" : editingId ? "Išsaugoti pakeitimus" : "Išsaugoti plytelę"}
                </Button>
              </div>
            </form>
          ) : null}

          <div className="overflow-hidden rounded-xl border border-stone-line bg-paper">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-stone-line bg-[#f3f3f0]">
                <tr>
                  <th className="px-4 py-3 font-semibold">Plytelė</th>
                  <th className="px-4 py-3 font-semibold">Tiekėjas</th>
                  <th className="px-4 py-3 font-semibold">Matmenys</th>
                  <th className="px-4 py-3 font-semibold">Diskas</th>
                  <th className="px-4 py-3 font-semibold">Kietumas</th>
                  <th className="px-4 py-3 font-semibold">Brokas</th>
                  <th className="px-4 py-3 font-semibold text-right">Kaina</th>
                  <th className="px-4 py-3 font-semibold" />
                </tr>
              </thead>
              <tbody>
                {tiles.map((tile) => (
                  <tr key={tile.id} className="border-b border-stone-line last:border-0">
                    <td className="px-4 py-3 font-medium">{tile.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{tile.supplier || "—"}</td>
                    <td className="px-4 py-3 tabular-nums">
                      {tile.lengthMm}×{tile.widthMm}×{tile.heightMm} mm
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{tile.disc ?? "—"}</td>
                    <td className="px-4 py-3 tabular-nums">{tile.hardness ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {tile.fragilityStrip || tile.fragilityCorner
                        ? `${tile.fragilityStrip ?? "—"} / ${tile.fragilityCorner ?? "—"}`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatCatalogPrice(tile.priceEur)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="border-stone-line"
                        onClick={() => startEdit(tile)}
                      >
                        Redaguoti
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="discs">
          <DiscCatalogSection discs={discs} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
