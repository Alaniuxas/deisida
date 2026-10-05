"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { patchMachine } from "@/lib/production-api";
import type { MachineCode } from "@/lib/production-types";

interface MachineLaneWidthPanelProps {
  machineId: string;
  machineCode: MachineCode;
  storedWidthMm: number;
}

export function MachineLaneWidthPanel({
  machineId,
  machineCode,
  storedWidthMm,
}: MachineLaneWidthPanelProps) {
  const router = useRouter();
  const [width, setWidth] = useState(String(storedWidthMm > 0 ? storedWidthMm : ""));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setWidth(String(storedWidthMm > 0 ? storedWidthMm : ""));
    setMessage(null);
    setError(null);
  }, [machineId, storedWidthMm]);

  async function handleSave() {
    const parsed = Number(width);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setError("Įveskite galiojantį plotį (0 arba daugiau mm).");
      setMessage(null);
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await patchMachine(machineId, { currentWidthMm: parsed });
      setMessage(
        parsed > 0
          ? `${machineCode}: sureguliuota ${parsed} mm`
          : `${machineCode}: plotis išvalytas (nereguliuotas)`,
      );
      router.refresh();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Nepavyko išsaugoti ploto.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-deisida/25 bg-deisida/5 px-4 py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="min-w-[12rem] flex-1 sm:max-w-xs">
          <Label htmlFor={`lane-width-${machineId}`} className="text-sm font-semibold">
            Dabartinis konvejerio plotis (mm)
          </Label>
          <Input
            id={`lane-width-${machineId}`}
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            value={width}
            onChange={(event) => setWidth(event.target.value)}
            placeholder="pvz. 65"
            className="mt-1.5 h-11 text-base"
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            Operatoriaus suregulavimas; Perskirstyti (±5 mm). 0 = nereguliuotas.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="h-11 rounded-xl bg-deisida px-5 text-deisida-foreground hover:bg-deisida/90"
          >
            {saving ? "Saugoma…" : "Išsaugoti plotį"}
          </Button>
          <Link
            href="/admin/konvejeriai?tab=konvejeriai"
            className="text-sm font-medium text-deisida underline-offset-2 hover:underline"
          >
            Visų staklių nustatymai
          </Link>
        </div>
      </div>
      {message ? (
        <p className="mt-2 text-sm font-medium text-deisida">{message}</p>
      ) : null}
      {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
