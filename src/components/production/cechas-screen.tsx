"use client";

import { useCallback, useEffect, useState } from "react";
import { Package, Ruler, Layers, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/production/async-state";
import { PageShell } from "@/components/production/page-shell";
import {
  fetchNextJob,
  finishJob,
  logPallet,
  switchConveyor,
} from "@/lib/production-api";
import { formatPackagingLines } from "@/lib/packaging-labels";
import type {
  ConveyorInfo,
  MachineCode,
  NextJobResponse,
  ProductionApiError,
  ShopJob,
} from "@/lib/production-types";

interface ConveyorOption {
  id: string;
  code: MachineCode;
  name: string;
}

function quantityLabel(unit: ShopJob["quantityUnit"], count: number): string {
  if (unit === "pallets") {
    return count === 1 ? "1 paletė" : `${count} paletės`;
  }
  return count === 1 ? "1 vnt." : `${count} vnt.`;
}

interface CechasScreenProps {
  initialData?: NextJobResponse;
  machines?: ConveyorOption[];
}

export function CechasScreen({ initialData, machines = [] }: CechasScreenProps) {
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState<ProductionApiError | null>(null);
  const [conveyor, setConveyor] = useState<ConveyorInfo | null>(
    initialData?.conveyor ?? null,
  );
  const [job, setJob] = useState<ShopJob | null>(initialData?.job ?? null);
  const [actionLoading, setActionLoading] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [finishReason, setFinishReason] = useState("");
  const [finishNotice, setFinishNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deviceNotice, setDeviceNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchNextJob();
      setConveyor(data.conveyor ?? null);
      setJob(data.job ?? null);
    } catch (err) {
      setConveyor(null);
      setJob(null);
      setError(err as ProductionApiError);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialData) return;

    let active = true;

    fetchNextJob()
      .then((data) => {
        if (!active) return;
        setConveyor(data.conveyor ?? null);
        setJob(data.job ?? null);
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        setConveyor(null);
        setJob(null);
        setError(err as ProductionApiError);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [initialData]);

  const handleSwitchConveyor = async (machineCode: MachineCode) => {
    if (!conveyor || conveyor.code === machineCode) return;
    setActionLoading(true);
    setActionError(null);
    setDeviceNotice(null);
    try {
      const data = await switchConveyor(machineCode);
      setConveyor(data.conveyor ?? null);
      setJob(data.job ?? null);
      const label = machines.find((machine) => machine.code === machineCode)?.name;
      setDeviceNotice(
        label
          ? `Įrenginys pakeistas į ${machineCode} (${label}).`
          : `Įrenginys pakeistas į ${machineCode}.`,
      );
    } catch (err) {
      const apiErr = err as ProductionApiError;
      setActionError(
        apiErr.kind === "not_found"
          ? "Įrenginio keitimas dar neveikia — API nepasiekiama."
          : apiErr.message,
      );
    } finally {
      setActionLoading(false);
    }
  };

  const handlePallet = async () => {
    if (!job) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const updated = await logPallet(job.id);
      setJob(updated);
    } catch (err) {
      const apiErr = err as ProductionApiError;
      setActionError(
        apiErr.kind === "not_found"
          ? "Paletės fiksavimas dar neveikia — API nepasiekiama."
          : apiErr.message,
      );
    } finally {
      setActionLoading(false);
    }
  };

  const handleFinish = async () => {
    if (!job) return;
    const underPlan = job.quantityLogged < job.quantityPlanned;
    if (underPlan && !finishReason.trim()) {
      setActionError("Įrašykite priežastį, kodėl neužbaigėte viso plano.");
      return;
    }

    setActionLoading(true);
    setActionError(null);
    try {
      const result = await finishJob(job.id, {
        reason: underPlan ? finishReason.trim() : undefined,
      });
      const percent =
        result.completionPercent ??
        Math.round((job.quantityLogged / job.quantityPlanned) * 100);

      if (percent < 90 || result.managerSignalSaved) {
        setFinishNotice(
          "Įrašytas signalas vadovui — užbaigta mažiau nei 90 % plano.",
        );
      } else {
        setFinishNotice("Darbas užbaigtas.");
      }

      setFinishOpen(false);
      setFinishReason("");
      await load();
    } catch (err) {
      const apiErr = err as ProductionApiError;
      setActionError(
        apiErr.kind === "not_found"
          ? "Darbo užbaigimas dar neveikia — API nepasiekiama."
          : apiErr.message,
      );
    } finally {
      setActionLoading(false);
    }
  };

  const packagingLines = job ? formatPackagingLines(job.packaging) : [];
  const needLeftovers = job?.packaging.needLeftovers === true;
  const completionPercent = job
    ? Math.round((job.quantityLogged / job.quantityPlanned) * 100)
    : 0;

  return (
    <PageShell
      title="Cechas"
      subtitle={
        conveyor
          ? `Jūsų konvejeris: ${conveyor.name} (${conveyor.code})`
          : "Kitas darbas jūsų konvejeryje"
      }
    >
      {loading ? <LoadingState label="Kraunamas darbas…" /> : null}

      {!loading && error ? (
        <div className="space-y-4">
          <ErrorState error={error} onRetry={load} />
          <EmptyState
            title="Darbo nėra"
            description="Kai API bus paruošta, čia matysite kitą darbą."
          />
        </div>
      ) : null}

      {!loading && !error && !job ? (
        <EmptyState
          title="Šiuo metu darbų nėra"
          description="Laukite, kol planuotojas priskirs naują užduotį."
        />
      ) : null}

      {!loading && job ? (
        <div className="space-y-5">
          {finishNotice ? (
            <Alert className="rounded-xl border-deisida/30 bg-deisida/5 px-4 py-4">
              <AlertTitle className="text-base text-deisida">
                {finishNotice}
              </AlertTitle>
            </Alert>
          ) : null}

          {actionError ? (
            <Alert variant="destructive" className="rounded-xl px-4 py-4">
              <AlertTitle className="text-base">Nepavyko</AlertTitle>
              <AlertDescription className="text-base">
                {actionError}
              </AlertDescription>
            </Alert>
          ) : null}

          {deviceNotice ? (
            <Alert className="rounded-xl border-deisida/30 bg-deisida/5 px-4 py-4">
              <AlertTitle className="text-base text-deisida">
                {deviceNotice}
              </AlertTitle>
            </Alert>
          ) : null}

          {job && machines.length > 0 && conveyor ? (
            <Card className="rounded-2xl border-stone-line">
              <CardContent className="space-y-4 pt-5">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <RefreshCw className="size-4" />
                  Keisti įrenginį
                </div>
                <p className="text-base">
                  Dabar dirbate:{" "}
                  <span className="font-semibold text-ink">
                    {conveyor.code} — {conveyor.name}
                  </span>
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {machines.map((machine) => {
                    const active = conveyor.code === machine.code;
                    return (
                      <Button
                        key={machine.id}
                        type="button"
                        variant={active ? "default" : "outline"}
                        disabled={actionLoading || active}
                        onClick={() => handleSwitchConveyor(machine.code)}
                        className={`h-14 rounded-xl text-base font-semibold ${
                          active
                            ? "bg-deisida text-deisida-foreground hover:bg-deisida/90"
                            : "border-stone-line"
                        }`}
                      >
                        {machine.code}
                        <span className="ml-2 font-normal opacity-80">
                          {machine.name}
                        </span>
                      </Button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ) : null}

          <Card className="paper-shadow rounded-2xl border-stone-line">
            <CardHeader className="gap-2 border-b border-stone-line pb-4">
              <CardTitle className="text-2xl font-semibold leading-tight">
                {job.tileName}
              </CardTitle>
              {(job.client || job.object) && (
                <p className="text-base text-muted-foreground">
                  {[job.client, job.object].filter(Boolean).join(" · ")}
                </p>
              )}
            </CardHeader>
            <CardContent className="space-y-5 pt-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <InfoRow
                  icon={<Ruler className="size-5 text-deisida" />}
                  label="Storis"
                  value={`${job.storisMm} mm`}
                />
                <InfoRow
                  icon={<Layers className="size-5 text-deisida" />}
                  label="Planas"
                  value={quantityLabel(job.quantityUnit, job.quantityPlanned)}
                />
                <InfoRow
                  icon={<Layers className="size-5 text-deisida" />}
                  label="Užfiksuota"
                  value={quantityLabel(job.quantityUnit, job.quantityLogged)}
                />
                <InfoRow
                  icon={<Layers className="size-5 text-deisida" />}
                  label="Liko"
                  value={quantityLabel(job.quantityUnit, job.remaining)}
                  highlight
                />
              </div>

              <div className="rounded-xl bg-muted/60 px-4 py-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Package className="size-4" />
                  Pakavimas
                </div>
                <ul className="space-y-1 text-base">
                  {packagingLines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
                {needLeftovers ? (
                  <p className="mt-3 text-base font-medium text-deisida">
                    Reikia likučių
                  </p>
                ) : null}
              </div>

              <div className="rounded-xl border border-stone-line px-4 py-3 text-center">
                <p className="text-sm text-muted-foreground">Atlikta</p>
                <p className="text-3xl font-semibold tabular-nums text-ink">
                  {completionPercent}%
                </p>
              </div>
            </CardContent>
          </Card>

          <Button
            type="button"
            disabled={actionLoading || job.remaining <= 0}
            onClick={handlePallet}
            className="h-16 w-full rounded-2xl bg-deisida text-lg font-semibold text-deisida-foreground hover:bg-deisida/90"
          >
            {actionLoading ? "Fiksuojama…" : "+1 paletė užfiksuota"}
          </Button>

          {!finishOpen ? (
            <Button
              type="button"
              variant="outline"
              disabled={actionLoading || job.quantityLogged === 0}
              onClick={() => setFinishOpen(true)}
              className="h-14 w-full rounded-2xl border-stone-line text-base font-medium"
            >
              Baigti darbą
            </Button>
          ) : (
            <Card className="rounded-2xl border-stone-line">
              <CardContent className="space-y-4 pt-5">
                <p className="text-base font-medium">Užbaigti šį darbą?</p>
                {job.quantityLogged < job.quantityPlanned ? (
                  <div className="space-y-2">
                    <Label htmlFor="finish-reason" className="text-base">
                      Kodėl neužbaigėte viso plano?
                    </Label>
                    <Textarea
                      id="finish-reason"
                      value={finishReason}
                      onChange={(e) => setFinishReason(e.target.value)}
                      placeholder="Pvz.: trūko medžiagos, sugadinta paletė…"
                      className="min-h-24 text-base"
                    />
                  </div>
                ) : null}
                <div className="grid gap-3 sm:grid-cols-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={actionLoading}
                    onClick={() => {
                      setFinishOpen(false);
                      setFinishReason("");
                      setActionError(null);
                    }}
                    className="h-12 rounded-xl text-base"
                  >
                    Atšaukti
                  </Button>
                  <Button
                    type="button"
                    disabled={actionLoading}
                    onClick={handleFinish}
                    className="h-12 rounded-xl bg-deisida text-base font-semibold text-deisida-foreground hover:bg-deisida/90"
                  >
                    {actionLoading ? "Baigiama…" : "Patvirtinti"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      ) : null}
    </PageShell>
  );
}

function InfoRow({
  icon,
  label,
  value,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`flex items-start gap-3 rounded-xl px-3 py-3 ${
        highlight ? "bg-deisida/8 ring-1 ring-deisida/20" : "bg-muted/40"
      }`}
    >
      <div className="mt-0.5">{icon}</div>
      <div>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-xl font-semibold tabular-nums">{value}</p>
      </div>
    </div>
  );
}
