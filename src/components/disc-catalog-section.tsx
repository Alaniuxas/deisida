"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Disc } from "@/lib/types";
import { formatCatalogPrice } from "@/lib/proposal-utils";

interface DiscCatalogSectionProps {
  discs: Disc[];
}

interface DiscFormState {
  name: string;
  description: string;
  diameterMm: string;
  thicknessMm: string;
  supplier: string;
  priceEur: string;
  workId: string;
}

function emptyDiscForm(): DiscFormState {
  return {
    name: "",
    description: "",
    diameterMm: "",
    thicknessMm: "",
    supplier: "",
    priceEur: "",
    workId: "",
  };
}

function discToForm(disc: Disc): DiscFormState {
  return {
    name: disc.name,
    description: disc.description ?? "",
    diameterMm: disc.diameterMm ? String(disc.diameterMm) : "",
    thicknessMm: disc.thicknessMm ? String(disc.thicknessMm) : "",
    supplier: disc.supplier ?? "",
    priceEur: disc.priceEur !== undefined ? String(disc.priceEur) : "",
    workId: disc.workId ?? "",
  };
}

function parseOptionalInt(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseOptionalPrice(value: string): number | undefined {
  const trimmed = value.trim().replace(",", ".");
  if (!trimmed) return undefined;
  const parsed = Number.parseFloat(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function DiscCatalogSection({ discs }: DiscCatalogSectionProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<DiscFormState>(emptyDiscForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function resetForm() {
    setForm(emptyDiscForm());
    setEditingId(null);
    setError(null);
  }

  function startCreate() {
    resetForm();
    setOpen(true);
    setMessage(null);
  }

  function startEdit(disc: Disc) {
    setEditingId(disc.id);
    setForm(discToForm(disc));
    setOpen(true);
    setError(null);
    setMessage(null);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (!form.name.trim()) {
      setError("Įveskite disko pavadinimą.");
      return;
    }

    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      diameterMm: parseOptionalInt(form.diameterMm),
      thicknessMm: parseOptionalInt(form.thicknessMm),
      supplier: form.supplier.trim(),
      priceEur: parseOptionalPrice(form.priceEur),
      workId: form.workId.trim(),
    };

    setSaving(true);
    try {
      const response = await fetch(editingId ? `/api/discs/${editingId}` : "/api/discs", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as { error?: string; disc?: Disc };
      if (!response.ok) {
        throw new Error(data.error ?? "Nepavyko išsaugoti disko.");
      }

      setMessage(
        editingId
          ? `Diskas „${data.disc?.name ?? form.name}“ atnaujintas.`
          : `Diskas „${data.disc?.name ?? form.name}“ pridėtas.`,
      );
      setOpen(false);
      resetForm();
      router.refresh();
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Nepavyko išsaugoti disko.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Kataloge {discs.length} diskų — naudojami plytelių pjovimo rekomendacijoms ir pasiūlymuose.
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
          {open ? "Atšaukti" : "Pridėti diską"}
        </Button>
      </div>

      {message ? <p className="mb-3 text-sm font-medium text-deisida">{message}</p> : null}

      {open ? (
        <form
          onSubmit={handleSubmit}
          className="mb-4 rounded-xl border border-stone-line bg-[#f3f3f0] p-4"
        >
          <p className="mb-4 text-sm font-semibold text-deisida-muted">
            {editingId ? "Redaguoti diską" : "Naujas diskas"}
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <Label htmlFor="disc-name">Pavadinimas</Label>
              <Input
                id="disc-name"
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                className="mt-1.5 h-10 bg-paper"
                required
              />
            </div>
            <div>
              <Label htmlFor="disc-work-id">Darbo ID / modelis</Label>
              <Input
                id="disc-work-id"
                value={form.workId}
                onChange={(event) => setForm((current) => ({ ...current, workId: event.target.value }))}
                className="mt-1.5 h-10 bg-paper"
              />
            </div>
            <div>
              <Label htmlFor="disc-supplier">Tiekėjas</Label>
              <Input
                id="disc-supplier"
                value={form.supplier}
                onChange={(event) =>
                  setForm((current) => ({ ...current, supplier: event.target.value }))
                }
                className="mt-1.5 h-10 bg-paper"
              />
            </div>
            <div>
              <Label htmlFor="disc-diameter">Skersmuo (mm)</Label>
              <Input
                id="disc-diameter"
                type="number"
                min={1}
                value={form.diameterMm}
                onChange={(event) =>
                  setForm((current) => ({ ...current, diameterMm: event.target.value }))
                }
                className="mt-1.5 h-10 bg-paper"
              />
            </div>
            <div>
              <Label htmlFor="disc-thickness">Storis (mm)</Label>
              <Input
                id="disc-thickness"
                type="number"
                min={1}
                value={form.thicknessMm}
                onChange={(event) =>
                  setForm((current) => ({ ...current, thicknessMm: event.target.value }))
                }
                className="mt-1.5 h-10 bg-paper"
              />
            </div>
            <div>
              <Label htmlFor="disc-price">Kaina (€)</Label>
              <Input
                id="disc-price"
                value={form.priceEur}
                onChange={(event) =>
                  setForm((current) => ({ ...current, priceEur: event.target.value }))
                }
                className="mt-1.5 h-10 bg-paper"
              />
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <Label htmlFor="disc-description">Aprašymas</Label>
              <Textarea
                id="disc-description"
                value={form.description}
                onChange={(event) =>
                  setForm((current) => ({ ...current, description: event.target.value }))
                }
                className="mt-1.5 min-h-24 bg-paper"
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
              {saving ? "Saugoma…" : editingId ? "Išsaugoti pakeitimus" : "Išsaugoti diską"}
            </Button>
          </div>
        </form>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-stone-line bg-paper">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-stone-line bg-[#f3f3f0]">
            <tr>
              <th className="px-4 py-3 font-semibold">Diskas</th>
              <th className="px-4 py-3 font-semibold">Modelis</th>
              <th className="px-4 py-3 font-semibold">Ø / storis</th>
              <th className="px-4 py-3 font-semibold">Tiekėjas</th>
              <th className="px-4 py-3 font-semibold text-right">Kaina</th>
              <th className="px-4 py-3 font-semibold" />
            </tr>
          </thead>
          <tbody>
            {discs.map((disc) => (
              <tr key={disc.id} className="border-b border-stone-line last:border-0">
                <td className="px-4 py-3">
                  <div className="font-medium">{disc.name}</div>
                  {disc.description ? (
                    <div className="mt-1 text-xs text-muted-foreground">{disc.description}</div>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{disc.workId ?? "—"}</td>
                <td className="px-4 py-3 tabular-nums">
                  {disc.diameterMm ? `Ø${disc.diameterMm}` : "—"}
                  {disc.thicknessMm ? ` / ${disc.thicknessMm} mm` : ""}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{disc.supplier ?? "—"}</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {disc.priceEur !== undefined ? formatCatalogPrice(disc.priceEur) : "—"}
                </td>
                <td className="px-4 py-3 text-right">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="border-stone-line"
                    onClick={() => startEdit(disc)}
                  >
                    Redaguoti
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
