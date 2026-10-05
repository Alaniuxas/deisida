"use client";

import { useEffect, useState } from "react";
import { LithuanianDatePicker } from "@/components/lithuanian-date-picker";
import { Label } from "@/components/ui/label";
import {
  buildMachineOptions,
  type QueueMoveSuggestion,
} from "@/components/production/queue-move-form";
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

export function QueueEnqueueForm({
  jobId,
  lanes,
  defaultDeadline = "",
  proposalNumber,
  widthMm,
}: {
  jobId: string;
  lanes: LaneOption[];
  defaultDeadline?: string;
  proposalNumber?: string;
  widthMm?: number;
}) {
  const [machineId, setMachineId] = useState(lanes[0]?.id ?? "");
  const [cutBy, setCutBy] = useState(
    effectiveCutByDeadline(defaultDeadline.slice(0, 10)),
  );
  const [suggestions, setSuggestions] = useState<QueueMoveSuggestion[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setCutBy(effectiveCutByDeadline(defaultDeadline.slice(0, 10)));
  }, [defaultDeadline]);

  useEffect(() => {
    if (!cutBy) {
      setSuggestions([]);
      return;
    }

    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const cutByIso = cutByIsoFromDate(cutBy);
        const response = await fetch(
          `/api/jobs/queue/suggest-move?jobId=${encodeURIComponent(jobId)}&cutBy=${encodeURIComponent(cutByIso)}`,
        );
        if (!response.ok) {
          setSuggestions([]);
          return;
        }
        const payload = (await response.json()) as { suggestions: QueueMoveSuggestion[] };
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
  }, [jobId, cutBy]);

  const machineOptions = buildMachineOptions(suggestions, lanes, machineId, cutBy);
  const selectedHint = suggestions.find((row) => row.machineId === machineId);

  return (
    <form
      method="post"
      action="/api/jobs/queue/enqueue"
      className="mt-3 space-y-3 rounded-lg border border-amber-200 bg-white p-3"
    >
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="cutBy" value={cutBy ? cutByIsoFromDate(cutBy) : ""} />
      <input type="hidden" name="reason" value="Įterpta į eilę" />
      <p className="text-xs font-semibold text-amber-950">
        Įterpti į eilę
        {proposalNumber ? ` · ${proposalNumber}` : ""}
        {widthMm ? ` · ${widthMm} mm` : ""}
      </p>

      <div>
        <Label htmlFor={`enqueue-cut-by-${jobId}`}>Iki kada supjauti</Label>
        <div className="mt-1.5">
          <LithuanianDatePicker
            id={`enqueue-cut-by-${jobId}`}
            value={cutBy}
            onChange={setCutBy}
          />
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Terminas supjauti: <strong>{formatDeadlineDate(cutBy)}</strong> (pn 17:00).
        </p>
      </div>

      <div>
        <Label htmlFor={`enqueue-machine-${jobId}`}>Konvejeris su kuriuo pjaunama</Label>
        {loading ? (
          <p className="mt-1 text-xs text-muted-foreground">Skaičiuojami konvejeriai…</p>
        ) : null}
        <select
          id={`enqueue-machine-${jobId}`}
          name="machineId"
          value={machineId}
          onChange={(event) => setMachineId(event.target.value)}
          required
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
                {formatScheduleFinishLabel(selectedHint.estimatedFinishIso)} — iki termino{" "}
                {formatDeadlineDate(cutBy)}.
              </>
            ) : (
              <>
                Gali baigti po termino {formatDeadlineDate(cutBy)}.
              </>
            )}
            {selectedHint.requiresChangeover ? " Reikės reguliavimo." : null}
          </p>
        ) : null}
      </div>

      <button
        type="submit"
        className="h-9 rounded-md bg-deisida px-4 text-sm font-medium text-deisida-foreground"
      >
        Įterpti į eilę
      </button>
    </form>
  );
}
