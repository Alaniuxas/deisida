"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { LithuanianDatePicker } from "@/components/lithuanian-date-picker";
import { QueueMoveForm } from "@/components/production/queue-move-form";
import {
  buildMachineOptions,
  type QueueMoveSuggestion,
} from "@/components/production/queue-move-form";
import {
  cutByIsoFromDate,
  effectiveCutByDeadline,
  formatDeadlineDate,
  formatScheduleTimestamp,
  formatScheduleTimestampFull,
} from "@/lib/queue/format";

interface LaneOption {
  id: string;
  label: string;
}

interface QueueJobRow {
  id: string;
  widthMm: number;
  quantity: number;
  quantityUnit: "pieces" | "pallets";
  deadline: string;
  proposalNumber: string | null;
}

interface PlannedJobRow extends QueueJobRow {
  machineId: string;
  machineCode: string;
  plannedStart: string;
  plannedEnd: string;
  deadlineWasAdjusted?: boolean;
}

function deadlineInputValue(value: string): string {
  return value.slice(0, 10);
}

export function ProposalEnqueuePanel({
  proposalId,
  defaultDeadline = "",
}: {
  proposalId: string;
  defaultDeadline?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [cutBy, setCutBy] = useState(
    effectiveCutByDeadline(deadlineInputValue(defaultDeadline)),
  );
  const [unassignedJobs, setUnassignedJobs] = useState<QueueJobRow[]>([]);
  const [plannedJobs, setPlannedJobs] = useState<PlannedJobRow[]>([]);
  const [lanes, setLanes] = useState<LaneOption[]>([]);
  const [machineByJob, setMachineByJob] = useState<Record<string, string>>({});
  const [suggestionsByJob, setSuggestionsByJob] = useState<
    Record<string, QueueMoveSuggestion[]>
  >({});
  const [canManage, setCanManage] = useState(false);
  const [canEnqueue, setCanEnqueue] = useState(false);
  const [planStatus, setPlanStatus] = useState<string | null>(null);
  const [proposalNumber, setProposalNumber] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash === "#eile") {
      setOpen(true);
    }
    const params = new URLSearchParams(window.location.search);
    if (params.get("moved") === "1") {
      setMessage("Perplanuota — gamybos eilė perskaičiuota.");
      setOpen(true);
    }
  }, []);

  const loadPreview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/proposals/${proposalId}/enqueue`);
      const data = (await response.json()) as {
        error?: string;
        canManage?: boolean;
        canEnqueue?: boolean;
        planStatus?: string | null;
        unassignedJobs?: QueueJobRow[];
        plannedJobs?: PlannedJobRow[];
        lanes?: LaneOption[];
        proposal?: { number: string; serviceDeadline: string };
      };
      if (!response.ok) {
        throw new Error(data.error ?? "Nepavyko užkrauti eilės duomenų.");
      }

      const nextUnassigned = data.unassignedJobs ?? [];
      const nextPlanned = data.plannedJobs ?? [];
      const nextDeadline = effectiveCutByDeadline(
        data.proposal?.serviceDeadline || defaultDeadline,
      );

      setCanManage(Boolean(data.canManage));
      setCanEnqueue(Boolean(data.canEnqueue));
      setPlanStatus(data.planStatus ?? null);
      setUnassignedJobs(nextUnassigned);
      setPlannedJobs(nextPlanned);
      setLanes(data.lanes ?? []);
      setProposalNumber(data.proposal?.number ?? "");
      setCutBy(nextDeadline);

      const initialMachines: Record<string, string> = {};
      for (const job of nextUnassigned) {
        initialMachines[job.id] = data.lanes?.[0]?.id ?? "";
      }
      setMachineByJob(initialMachines);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Nepavyko užkrauti.",
      );
    } finally {
      setLoading(false);
    }
  }, [proposalId, defaultDeadline]);

  useEffect(() => {
    if (!open) return;
    void loadPreview();
  }, [open, loadPreview]);

  useEffect(() => {
    if (!open || !cutBy || unassignedJobs.length === 0) {
      if (unassignedJobs.length === 0) {
        setSuggestionsByJob({});
      }
      return;
    }

    const timer = window.setTimeout(async () => {
      const cutByIso = cutByIsoFromDate(cutBy);
      const nextSuggestions: Record<string, QueueMoveSuggestion[]> = {};
      const nextMachines: Record<string, string> = {};

      await Promise.all(
        unassignedJobs.map(async (job) => {
          const response = await fetch(
            `/api/jobs/queue/suggest-move?jobId=${encodeURIComponent(job.id)}&cutBy=${encodeURIComponent(cutByIso)}`,
          );
          if (!response.ok) return;
          const payload = (await response.json()) as {
            suggestions: QueueMoveSuggestion[];
          };
          nextSuggestions[job.id] = payload.suggestions ?? [];
          const recommended = payload.suggestions?.find((row) => row.recommended);
          nextMachines[job.id] =
            recommended?.machineId ?? lanes[0]?.id ?? "";
        }),
      );

      setSuggestionsByJob(nextSuggestions);
      setMachineByJob((current) => ({ ...current, ...nextMachines }));
    }, 300);

    return () => window.clearTimeout(timer);
  }, [open, cutBy, unassignedJobs, lanes]);

  async function handleEnqueueSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/proposals/${proposalId}/enqueue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cutBy: cutByIsoFromDate(cutBy),
          machineIdByJob: machineByJob,
          reason: "Įterpta į eilę",
        }),
      });
      const data = (await response.json()) as { error?: string; enqueued?: number };
      if (!response.ok) {
        throw new Error(data.error ?? "Nepavyko įterpti į eilę.");
      }
      setMessage(
        `Į eilę įterpta ${data.enqueued ?? unassignedJobs.length} ${data.enqueued === 1 ? "darbas" : "darbai"}.`,
      );
      await loadPreview();
      router.refresh();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Nepavyko įterpti į eilę.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (!proposalId) return null;

  function buildCollapsedSummary(): string {
    if (loading) return "Kraunama…";
    if (plannedJobs.length > 0) {
      const sorted = [...plannedJobs].sort((a, b) =>
        a.plannedStart.localeCompare(b.plannedStart),
      );
      const first = sorted[0];
      const cutByLabel = formatDeadlineDate(
        effectiveCutByDeadline(first.deadline, first.plannedEnd),
      );
      if (sorted.length === 1) {
        return `Planuojama supjauti ${formatScheduleTimestampFull(first.plannedStart)} · ${first.machineCode} · terminas ${cutByLabel}`;
      }
      const last = sorted[sorted.length - 1];
      return `Planuojama supjauti: ${sorted.length} darbai · nuo ${formatScheduleTimestamp(first.plannedStart)} iki ${formatScheduleTimestamp(last.plannedEnd)}`;
    }
    if (canEnqueue && unassignedJobs.length > 0) {
      return `${unassignedJobs.length} nepriskirti — nustatykite terminą ir įterpkite į eilę`;
    }
    return "Nėra aktyvių darbų eilėje";
  }

  const summaryText = buildCollapsedSummary();

  return (
    <div id="eile" className="border-t border-stone-line bg-[#fff8eb] px-6 py-5 lg:px-10">
      <details
        className="group rounded-xl border border-amber-200/80 bg-white shadow-sm"
        open={open}
        onToggle={(event) => setOpen((event.target as HTMLDetailsElement).open)}
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 [&::-webkit-details-marker]:hidden">
          <div>
            <p className="text-base font-semibold text-amber-950">Gamybos eilė</p>
            <p className="mt-0.5 text-sm text-muted-foreground">{summaryText}</p>
            {!open && plannedJobs.length > 1 ? (
              <p className="mt-1 text-xs text-amber-900/80">
                Išskleiskite, kad matytumėte kiekvieno darbo laikus ir konvejerį.
              </p>
            ) : null}
          </div>
          <ChevronDown className="size-5 shrink-0 text-muted-foreground transition group-open:rotate-180" />
        </summary>

        <div className="space-y-6 border-t border-amber-100 px-5 pb-5 pt-4">
          {message ? (
            <p className="rounded-lg bg-[#eef6ee] px-3 py-2 text-sm font-medium text-[#2d5a2d]">
              {message}
            </p>
          ) : null}

          {loading ? (
            <p className="text-sm text-muted-foreground">Kraunama…</p>
          ) : planStatus === "accepted" ? (
            <p className="text-sm text-muted-foreground">
              Savaitės planas užrakintas — /eile atverkite planą redagavimui.
            </p>
          ) : !canManage && plannedJobs.length === 0 && unassignedJobs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Dar nėra patvirtintų gamybos darbų arba nėra savaitės plano.
            </p>
          ) : (
            <>
              {open
                ? plannedJobs.map((job, index) => {
                const displayDeadline = effectiveCutByDeadline(
                  job.deadline,
                  job.plannedEnd,
                );
                return (
                  <div
                    key={job.id}
                    className={
                      index > 0 ? "border-t border-stone-line pt-6" : undefined
                    }
                  >
                    <div className="grid gap-6 lg:grid-cols-2 lg:gap-10">
                      <div>
                        <p className="text-base font-semibold text-ink">
                          {job.widthMm} mm · {job.quantity}{" "}
                          {job.quantityUnit === "pieces" ? "vnt." : "pal."}
                        </p>
                        <dl className="mt-3 space-y-1.5 text-sm">
                          <div>
                            <dt className="inline text-muted-foreground">
                              Konvejeris su kuriuo pjaunama:{" "}
                            </dt>
                            <dd className="inline font-medium text-ink">
                              {job.machineCode}
                            </dd>
                          </div>
                          <div>
                            <dt className="inline text-muted-foreground">
                              Numatoma pradžia:{" "}
                            </dt>
                            <dd className="inline text-ink">
                              {formatScheduleTimestampFull(job.plannedStart)}
                            </dd>
                          </div>
                          <div>
                            <dt className="inline text-muted-foreground">
                              Numatoma pabaiga:{" "}
                            </dt>
                            <dd className="inline text-ink">
                              {formatScheduleTimestampFull(job.plannedEnd)}
                            </dd>
                          </div>
                          <div>
                            <dt className="inline text-muted-foreground">
                              Terminas supjauti:{" "}
                            </dt>
                            <dd className="inline font-medium text-ink">
                              {formatDeadlineDate(displayDeadline)}
                            </dd>
                          </div>
                        </dl>
                        {job.deadlineWasAdjusted ? (
                          <p className="mt-2 text-xs text-amber-900">
                            Terminas buvo ankstesnis už planuojamą pabaigą —
                            atnaujintas pagal gamybos grafiką.
                          </p>
                        ) : null}
                      </div>

                      <QueueMoveForm
                        jobId={job.id}
                        defaultMachineId={job.machineId}
                        defaultDeadline={displayDeadline}
                        plannedEnd={job.plannedEnd}
                        lanes={lanes}
                        submitLabel="Perplanuoti"
                        returnTo={`/pasiulymai/${proposalId}?moved=1#eile`}
                        fetchSuggestions
                      />
                    </div>
                  </div>
                );
              })
                : null}

              {canEnqueue && unassignedJobs.length > 0 ? (
                <form
                  onSubmit={handleEnqueueSubmit}
                  className={
                    plannedJobs.length > 0
                      ? "space-y-4 border-t border-stone-line pt-6"
                      : "space-y-4"
                  }
                >
                  <p className="text-sm font-semibold text-deisida-muted">
                    Nepriskirti · {proposalNumber}
                  </p>
                  <div className="max-w-md">
                    <Label htmlFor="proposal-cut-by">Iki kada supjauti</Label>
                    <div className="mt-1.5">
                      <LithuanianDatePicker
                        id="proposal-cut-by"
                        value={cutBy}
                        onChange={setCutBy}
                      />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Terminas supjauti: <strong>{formatDeadlineDate(cutBy)}</strong> (pn
                      17:00).
                    </p>
                  </div>

                  <ul className="space-y-4">
                    {unassignedJobs.map((job) => {
                      const suggestions = suggestionsByJob[job.id] ?? [];
                      const options = buildMachineOptions(
                        suggestions,
                        lanes,
                        machineByJob[job.id] ?? "",
                        cutBy,
                      );
                      return (
                        <li
                          key={job.id}
                          className="border-t border-stone-line pt-4 first:border-0 first:pt-0"
                        >
                          <p className="font-medium text-ink">
                            {job.widthMm} mm · {job.quantity}{" "}
                            {job.quantityUnit === "pieces" ? "vnt." : "pal."}
                          </p>
                          <label className="mt-3 block text-sm">
                            <span className="text-muted-foreground">
                              Konvejeris su kuriuo pjaunama
                            </span>
                            <select
                              value={machineByJob[job.id] ?? ""}
                              onChange={(event) =>
                                setMachineByJob((current) => ({
                                  ...current,
                                  [job.id]: event.target.value,
                                }))
                              }
                              className="mt-1.5 h-10 w-full rounded-md border border-stone-line bg-paper px-2 text-sm"
                            >
                              {options.map((option) => (
                                <option key={option.id} value={option.id}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </label>
                        </li>
                      );
                    })}
                  </ul>

                  {error ? <p className="text-sm text-destructive">{error}</p> : null}

                  <Button
                    type="submit"
                    disabled={saving || !cutBy}
                    className="h-10 bg-deisida text-deisida-foreground hover:bg-deisida/90"
                  >
                    {saving ? "Skaičiuojama…" : "Įterpti ir perskaičiuoti eilę"}
                  </Button>
                </form>
              ) : null}
            </>
          )}
        </div>
      </details>
    </div>
  );
}
