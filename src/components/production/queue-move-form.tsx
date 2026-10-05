"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LithuanianDatePicker } from "@/components/lithuanian-date-picker";
import { Label } from "@/components/ui/label";
import {
  cutByIsoFromDate,
  effectiveCutByDeadline,
  formatDeadlineDate,
  formatScheduleFinishLabel,
} from "@/lib/queue/format";

interface LaneOption {
  id: string;
  label: string;
}

interface MoveSuggestion {
  machineId: string;
  machineCode: string;
  storedWidthMm: number;
  eligible: boolean;
  requiresChangeover: boolean;
  estimatedFinishIso: string | null;
  meetsDeadline: boolean;
  reason: string;
  recommended: boolean;
}

function formatMachineOption(row: MoveSuggestion, cutBy: string): string {
  const parts = [row.machineCode];
  if (row.recommended) parts.push("rekomenduojama");
  parts.push(`pabaiga ${formatScheduleFinishLabel(row.estimatedFinishIso)}`);
  if (row.meetsDeadline) {
    parts.push(`iki ${formatDeadlineDate(cutBy)} ✓`);
  } else {
    parts.push("po termino");
  }
  if (row.requiresChangeover) parts.push("reguliavimas");
  return parts.join(" · ");
}

function buildMachineOptions(
  suggestions: MoveSuggestion[],
  lanes: LaneOption[],
  selectedId: string,
  cutBy: string,
): { id: string; label: string }[] {
  const options = suggestions.slice(0, 8).map((row) => ({
    id: row.machineId,
    label: formatMachineOption(row, cutBy),
  }));
  const seen = new Set(options.map((row) => row.id));

  for (const lane of lanes) {
    if (seen.has(lane.id)) continue;
    options.push({ id: lane.id, label: lane.label });
    seen.add(lane.id);
  }

  if (selectedId && !seen.has(selectedId)) {
    options.unshift({ id: selectedId, label: selectedId });
  }

  return options;
}

export function QueueMoveForm({
  jobId,
  lanes,
  defaultMachineId,
  defaultDeadline = "",
  plannedEnd,
  submitLabel = "Išsaugoti perkėlimą",
  defaultReason = "Perplanuota pagal terminą",
  returnTo = "",
  hideReason = true,
  fetchSuggestions = true,
}: {
  jobId: string;
  lanes: LaneOption[];
  defaultMachineId: string;
  defaultDeadline?: string;
  plannedEnd?: string;
  submitLabel?: string;
  defaultReason?: string;
  returnTo?: string;
  hideReason?: boolean;
  /** When false, skips suggest-move API until parent enables (e.g. after opening details). */
  fetchSuggestions?: boolean;
}) {
  const resolvedDeadline = useMemo(
    () => effectiveCutByDeadline(defaultDeadline, plannedEnd),
    [defaultDeadline, plannedEnd],
  );
  const [machineId, setMachineId] = useState(defaultMachineId);
  const [cutBy, setCutBy] = useState(resolvedDeadline);
  const [reason, setReason] = useState(defaultReason);
  const [suggestions, setSuggestions] = useState<MoveSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    setMachineId(defaultMachineId);
  }, [defaultMachineId]);

  useEffect(() => {
    setCutBy(resolvedDeadline);
  }, [resolvedDeadline]);

  useEffect(() => {
    if (!fetchSuggestions || !cutBy) {
      if (!fetchSuggestions) {
        setSuggestions([]);
        setLoading(false);
      }
      return;
    }

    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const cutByIso = cutBy.includes("T") ? cutBy : cutByIsoFromDate(cutBy);
        const response = await fetch(
          `/api/jobs/queue/suggest-move?jobId=${encodeURIComponent(jobId)}&cutBy=${encodeURIComponent(cutByIso)}`,
        );
        if (!response.ok) {
          setSuggestions([]);
          return;
        }
        const payload = (await response.json()) as { suggestions: MoveSuggestion[] };
        const nextSuggestions = payload.suggestions ?? [];
        setSuggestions(nextSuggestions);
        const recommended = nextSuggestions.find((row) => row.recommended);
        if (recommended) {
          setMachineId(recommended.machineId);
        }
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => window.clearTimeout(timer);
  }, [jobId, cutBy, defaultMachineId, fetchSuggestions]);

  const machineOptions = buildMachineOptions(suggestions, lanes, machineId, cutBy);
  const selectedHint = suggestions.find((row) => row.machineId === machineId);
  const recommended = suggestions.find((row) => row.recommended);

  async function handleSubmit() {
    if (!cutBy || !machineId) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const response = await fetch("/api/jobs/queue/override", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId,
          machineId,
          cutBy: cutByIsoFromDate(cutBy),
          reason,
          returnTo,
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Nepavyko perplanuoti.");
      }
      const safeReturn =
        returnTo.startsWith("/") && !returnTo.startsWith("//")
          ? returnTo
          : "/eile?moved=1";
      router.push(safeReturn);
      router.refresh();
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "Nepavyko perplanuoti.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <Label htmlFor={`cut-by-${jobId}`}>Iki kada supjauti</Label>
        <div className="mt-1.5">
          <LithuanianDatePicker
            id={`cut-by-${jobId}`}
            value={cutBy}
            onChange={setCutBy}
          />
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Terminas supjauti: <strong>{formatDeadlineDate(cutBy)}</strong> (pn 17:00).
        </p>
      </div>

      <div>
        <Label htmlFor={`machine-${jobId}`}>Konvejeris su kuriuo pjaunama</Label>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Simuliuojama visa staklės eilė (kiti darbai, plotis, prioritetai). Ieškoma
          vietos be reguliavimo — terminas leidžia vėlesnę pabaigą.
        </p>
        {loading ? (
          <p className="mt-1 text-xs text-muted-foreground">Skaičiuojami konvejeriai…</p>
        ) : null}
        <select
          id={`machine-${jobId}`}
          value={machineId}
          onChange={(event) => setMachineId(event.target.value)}
          className="mt-1.5 h-10 w-full rounded-md border border-stone-line bg-paper px-2 text-sm"
        >
          {machineOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
        {selectedHint && !loading ? (
          <p className="mt-1 text-xs text-muted-foreground">
            {selectedHint.meetsDeadline ? (
              <>
                Numatoma pabaiga{" "}
                <strong>
                  {formatScheduleFinishLabel(selectedHint.estimatedFinishIso)}
                </strong>
                {" — "}
                {recommended?.machineId === selectedHint.machineId ? (
                  <>
                    geriausia staklė pagal eilę ir plotį
                    {recommended.machineId === defaultMachineId
                      ? " (dabar jau plane šioje staklėje)"
                      : ""}
                    .
                  </>
                ) : (
                  <>iki termino {formatDeadlineDate(cutBy)}.</>
                )}
              </>
            ) : (
              <>
                Gali baigti po termino {formatDeadlineDate(cutBy)} (
                {formatScheduleFinishLabel(selectedHint.estimatedFinishIso)}).
              </>
            )}
            {selectedHint.requiresChangeover ? " Reikės reguliavimo." : null}
          </p>
        ) : null}
      </div>

      {!hideReason ? (
        <input
          required
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Priežastis"
          className="h-9 w-full rounded-md border border-stone-line bg-paper px-3 text-sm"
        />
      ) : null}

      {submitError ? (
        <p className="text-sm text-destructive">{submitError}</p>
      ) : null}

      <button
        type="button"
        disabled={submitting || !cutBy || !machineId}
        onClick={() => void handleSubmit()}
        className="h-9 rounded-md bg-deisida px-4 text-sm font-medium text-deisida-foreground disabled:opacity-60"
      >
        {submitting ? "Skaičiuojama…" : submitLabel}
      </button>
    </div>
  );
}

export { buildMachineOptions, formatMachineOption };
export type { MoveSuggestion as QueueMoveSuggestion, LaneOption as QueueLaneOption };
