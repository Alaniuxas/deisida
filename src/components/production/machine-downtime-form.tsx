"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { lt } from "date-fns/locale";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LithuanianDatePicker } from "@/components/lithuanian-date-picker";
import { LithuanianTimePicker } from "@/components/lithuanian-time-picker";
import type { DeadlineImpactJob } from "@/lib/queue/deadline-impact";
import { setEileFlashNotice } from "@/lib/eile-flash-notice";
import type { DowntimeMove } from "@/lib/queue/downtime-redistribute";
import { formatDowntimeNotice } from "@/lib/queue/downtime-summary";
import { defaultDowntimeRange } from "@/lib/vilnius-now";
import type { MachineCode } from "@/lib/production-types";

export interface DowntimeRow {
  id: string;
  machineId: string;
  machineCode: MachineCode;
  startAt: string;
  endAt: string;
  reason: string;
}

interface DowntimePreviewState {
  moveCount: number;
  moves: DowntimeMove[];
  newlyLate: DeadlineImpactJob[];
  lateJobs: DeadlineImpactJob[];
}

function formatLtDateTime(iso: string): string {
  try {
    return format(new Date(iso), "yyyy-MM-dd HH:mm", { locale: lt });
  } catch {
    return iso;
  }
}

function combineDateAndTime(dateIso: string, time: string): string {
  if (!dateIso || !time) return "";
  return `${dateIso}T${time}:00`;
}

interface MachineLaneDowntimePanelProps {
  machineId: string;
  machineCode: MachineCode;
  downtimes: DowntimeRow[];
}

export function MachineLaneDowntimePanel({
  machineId,
  machineCode,
  downtimes,
}: MachineLaneDowntimePanelProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<DowntimePreviewState | null>(null);
  const [acceptedLateJobIds, setAcceptedLateJobIds] = useState<Set<string>>(new Set());
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("08:00");
  const [endDate, setEndDate] = useState("");
  const [endTime, setEndTime] = useState("17:00");
  const laneDowntimes = downtimes.filter((row) => row.machineId === machineId);

  const handleDetailsToggle = (event: React.SyntheticEvent<HTMLDetailsElement>) => {
    if (!event.currentTarget.open) return;
    const defaults = defaultDowntimeRange();
    setStartDate(defaults.startDate);
    setStartTime(defaults.startTime);
    setEndDate(defaults.endDate);
    setEndTime(defaults.endTime);
    setError(null);
  };

  const startAtValue = combineDateAndTime(startDate, startTime);
  const endAtValue = combineDateAndTime(endDate, endTime);

  useEffect(() => {
    if (!preview) {
      setAcceptedLateJobIds(new Set());
      return;
    }
    setAcceptedLateJobIds(new Set(preview.newlyLate.map((job) => job.jobId)));
  }, [preview]);

  const toggleAcceptedLate = (jobId: string, accepted: boolean) => {
    setAcceptedLateJobIds((current) => {
      const next = new Set(current);
      if (accepted) {
        next.add(jobId);
      } else {
        next.delete(jobId);
      }
      return next;
    });
  };

  const saveDowntime = async () => {
    const excludeJobIds = preview
      ? preview.newlyLate
          .map((job) => job.jobId)
          .filter((jobId) => !acceptedLateJobIds.has(jobId))
      : [];
    const acceptedLateIds = [...acceptedLateJobIds];

    const response = await fetch("/api/admin/machine-downtimes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        machineId,
        startAt: startAtValue,
        endAt: endAtValue,
        reason,
        excludeJobIds,
        acceptedLateJobIds: acceptedLateIds,
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error ?? "Gedimo įrašymas nepavyko.");
    }

    const notice =
      typeof data.notice === "string"
        ? data.notice
        : formatDowntimeNotice(data.reschedule?.downtimeMoves ?? [], {
            confirmedLateCount: acceptedLateIds.length,
            manualJobCount: excludeJobIds.length,
          });
    setEileFlashNotice(notice);
    router.push("/eile");
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!startAtValue || !endAtValue) return;

    setPending(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/machine-downtimes/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          machineId,
          startAt: startAtValue,
          endAt: endAtValue,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Nepavyko peržiūrėti perskirstymo.");
      }

      if (data.newlyLate?.length > 0) {
        setPreview({
          moveCount: data.moveCount ?? 0,
          moves: data.moves ?? [],
          newlyLate: data.newlyLate,
          lateJobs: data.lateJobs ?? data.newlyLate,
        });
        setPending(false);
        return;
      }

      await saveDowntime();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gedimo įrašymas nepavyko.");
      setPending(false);
    }
  };

  const confirmWithLateJobs = async () => {
    if (!preview) return;
    setPending(true);
    setError(null);
    try {
      await saveDowntime();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gedimo įrašymas nepavyko.");
      setPending(false);
    }
  };

  const excludedCount = preview
    ? preview.newlyLate.filter((job) => !acceptedLateJobIds.has(job.jobId)).length
    : 0;
  const acceptedCount = preview ? acceptedLateJobIds.size : 0;

  return (
    <>
      <details
        className="rounded-2xl border border-stone-line bg-paper group"
        onToggle={handleDetailsToggle}
      >
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-ink [&::-webkit-details-marker]:hidden">
          <span className="flex flex-wrap items-center gap-2">
            <span>Staklės gedimas ({machineCode})</span>
            {laneDowntimes.length > 0 ? (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
                {laneDowntimes.length} aktyvus
              </span>
            ) : null}
          </span>
          <span className="mt-1 block text-xs font-normal text-muted-foreground">
            Pažymėkite gedimą ir numatomą sutvarkymo datą — eilėje laukiantys darbai
            automatiškai persiskirstys į kitas stakles, planas perskaičiuojamas iš naujo.
          </span>
        </summary>

        <div className="space-y-4 border-t border-stone-line px-4 py-4">
          {error ? (
            <Alert variant="destructive" className="rounded-xl">
              <AlertTitle>Klaida</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          {laneDowntimes.length > 0 ? (
            <ul className="space-y-2 text-sm">
              {laneDowntimes.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-muted/40 px-3 py-2"
                >
                  <span>
                    {formatLtDateTime(row.startAt)} – {formatLtDateTime(row.endAt)}
                    {row.reason ? ` · ${row.reason}` : ""}
                  </span>
                  <form
                    method="post"
                    action={`/api/admin/machine-downtimes/${row.id}/delete`}
                    onSubmit={() => setPending(true)}
                  >
                    <Button
                      type="submit"
                      variant="outline"
                      size="sm"
                      disabled={pending}
                    >
                      Atšaukti
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          ) : null}

          <form className="grid gap-3 sm:grid-cols-2" onSubmit={handleSubmit}>
            <div className="space-y-2 sm:col-span-2">
              <Label>Gedimas nuo</Label>
              <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                <LithuanianDatePicker
                  id={`downtime-start-date-${machineId}`}
                  value={startDate}
                  onChange={setStartDate}
                  placeholder="Pasirinkite datą"
                />
                <div className="space-y-1 sm:w-[9.5rem]">
                  <Label
                    htmlFor={`downtime-start-time-${machineId}`}
                    className="text-xs text-muted-foreground"
                  >
                    Laikas (24 val.)
                  </Label>
                  <LithuanianTimePicker
                    id={`downtime-start-time-${machineId}`}
                    value={startTime}
                    onChange={setStartTime}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label>Numatomas sutvarkymas iki (±)</Label>
              <p className="text-xs text-muted-foreground">
                Jei remontas užtruks ilgiau nei savaitė, darbai toliau skirstomi per
                kitas stakles — galite koreguoti datą vėliau.
              </p>
              <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                <LithuanianDatePicker
                  id={`downtime-end-date-${machineId}`}
                  value={endDate}
                  onChange={setEndDate}
                  placeholder="Pasirinkite datą"
                />
                <div className="space-y-1 sm:w-[9.5rem]">
                  <Label
                    htmlFor={`downtime-end-time-${machineId}`}
                    className="text-xs text-muted-foreground"
                  >
                    Laikas (24 val.)
                  </Label>
                  <LithuanianTimePicker
                    id={`downtime-end-time-${machineId}`}
                    value={endTime}
                    onChange={setEndTime}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor={`downtime-reason-${machineId}`}>Priežastis</Label>
              <Input
                id={`downtime-reason-${machineId}`}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Pvz.: gedimas, remontas"
                className="bg-paper"
              />
            </div>

            <div className="sm:col-span-2">
              <Button
                type="submit"
                disabled={pending || !startDate || !endDate}
                className="bg-deisida text-deisida-foreground"
              >
                {pending ? "Saugoma…" : "Žymėti gedimą ir perskirstyti"}
              </Button>
            </div>
          </form>
        </div>
      </details>

      {preview ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <Card className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border-stone-line shadow-xl">
            <CardHeader>
              <CardTitle className="text-lg">
                {preview.newlyLate.length === 1
                  ? "1 užsakymas bus supjautas po termino"
                  : `${preview.newlyLate.length} užsakymai bus supjauti po termino`}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert className="rounded-xl border-amber-300 bg-amber-50">
                <AlertTitle className="text-amber-950">
                  Nepavyko visko sutalpinti į terminus
                </AlertTitle>
                <AlertDescription className="text-amber-900">
                  {preview.moveCount > 0
                    ? `Perkelta ${preview.moveCount} darb. iš ${machineCode}. `
                    : ""}
                  Sistema jau bandė automatiškai perstatyti eilę (staklės, vietos,
                  terminai), bet šie užsakymai vis tiek baigsis vėliau nei „Iki kada
                  supjauti“.
                </AlertDescription>
              </Alert>

              <ul className="space-y-2 text-sm">
                {preview.newlyLate.map((job) => {
                  const accepted = acceptedLateJobIds.has(job.jobId);
                  return (
                    <li
                      key={job.jobId}
                      className={`rounded-xl border px-3 py-2 ${
                        accepted
                          ? "border-stone-line bg-muted/30"
                          : "border-amber-300 bg-amber-50/80"
                      }`}
                    >
                      <label className="flex cursor-pointer items-start gap-3">
                        <Checkbox
                          checked={accepted}
                          onCheckedChange={(checked) =>
                            toggleAcceptedLate(job.jobId, checked === true)
                          }
                          className="mt-0.5"
                          aria-label={`Priimti vėlavimą: ${job.proposalNumber}`}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium text-ink">
                            {job.proposalNumber}
                          </span>
                          <span className="mt-1 block text-muted-foreground">
                            {job.moved && job.fromMachineCode
                              ? `${job.fromMachineCode} → ${job.machineCode} · `
                              : `${job.machineCode} · `}
                            {job.widthMm} mm
                          </span>
                          <span className="mt-1 block text-muted-foreground">
                            Terminas: {job.deadlineLabel} · planuojama pabaiga:{" "}
                            {job.plannedEndLabel}
                          </span>
                          {!accepted ? (
                            <span className="mt-1 block text-xs font-medium text-amber-900">
                              Neperkeliama automatiškai — tvarkykite rankiniu būdu.
                            </span>
                          ) : null}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>

              <p className="text-sm text-muted-foreground">
                Pažymėkite užsakymus, kuriems <strong>tinka vėluoti</strong> po
                automatinio perskirstymo. Nežymėti lieka ant gedimo staklės — juos
                reikės perkelkite arba pailginti terminą rankiniu būdu.
              </p>

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={confirmWithLateJobs}
                  disabled={pending}
                  className="bg-deisida text-deisida-foreground hover:bg-deisida/90"
                >
                  {pending
                    ? "Saugoma…"
                    : excludedCount > 0
                      ? `Tęsti (${acceptedCount} vėluoja, ${excludedCount} rankiniu)`
                      : acceptedCount > 0
                        ? `Tęsti (${acceptedCount} vėluoja)`
                        : "Tęsti"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending}
                  onClick={() => setPreview(null)}
                >
                  Atšaukti
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </>
  );
}
