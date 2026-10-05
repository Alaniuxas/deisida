import {
  Package,
  Ruler,
  Layers,
  MapPin,
  Scissors,
  CalendarDays,
  Cog,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPackagingLines } from "@/lib/packaging-labels";
import {
  formatDeadlineDate,
  formatDurationHours,
  formatScheduleTimestamp,
} from "@/lib/queue/format";
import { formatPalletRateWithNorm } from "@/lib/queue/rate-labels";
import type { ShopJob } from "@/lib/production-types";
import { CechasQuickInput } from "@/components/production/cechas-quick-input";

function quantityLabel(unit: ShopJob["quantityUnit"], count: number): string {
  if (unit === "pallets") {
    return count === 1 ? "1 paletė" : `${count} paletės`;
  }
  return count === 1 ? "1 vnt." : `${count} vnt.`;
}

interface CechasJobPanelProps {
  job: ShopJob;
  notice?: string;
  error?: string;
}

export function CechasJobPanel({ job, notice, error }: CechasJobPanelProps) {
  const packagingLines = formatPackagingLines(job.packaging);
  const schedule = job.schedule;
  const completionPercent =
    job.quantityPlanned > 0
      ? Math.round((job.quantityLogged / job.quantityPlanned) * 100)
      : 0;

  return (
    <div className="space-y-4">
      {notice ? (
        <p className="rounded-xl border border-deisida/30 bg-deisida/5 px-4 py-3 text-base font-medium text-deisida">
          {notice}
        </p>
      ) : null}

      {error ? (
        <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-base text-destructive">
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <Card className="paper-shadow rounded-2xl border-stone-line">
          <CardHeader className="gap-2 border-b border-stone-line pb-4">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium text-muted-foreground">
                Dabartinis darbas
                {job.proposalNumber ? ` · ${job.proposalNumber}` : ""}
              </p>
              {schedule ? (
                <>
                  <Badge className="bg-deisida text-deisida-foreground">
                    {schedule.conveyorShopCode}
                  </Badge>
                  <Badge variant="outline">#{schedule.positionInQueue} eilėje</Badge>
                </>
              ) : null}
            </div>
            <CardTitle className="text-2xl font-semibold leading-tight">
              {job.tileName}
            </CardTitle>
            {(job.client || job.object) && (
              <p className="text-base text-muted-foreground">
                {[job.client, job.object].filter(Boolean).join(" · ")}
              </p>
            )}
            {job.address ? (
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <MapPin className="size-4 shrink-0" />
                {job.address}
              </p>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {schedule ? (
                <InfoRow
                  icon={<Ruler className="size-4 text-deisida" />}
                  label="Plytos plotis"
                  value={`${schedule.widthMm} mm`}
                />
              ) : null}
              <InfoRow
                icon={<Ruler className="size-4 text-deisida" />}
                label="Pjovimo storis"
                value={`${job.storisMm} mm`}
              />
              {schedule ? (
                <InfoRow
                  icon={<CalendarDays className="size-4 text-deisida" />}
                  label="Terminas"
                  value={formatDeadlineDate(schedule.deadline)}
                />
              ) : null}
              <InfoRow
                icon={<Scissors className="size-4 text-deisida" />}
                label="Pjūvis"
                value={job.pjovimas || "—"}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <ProgressBox
                label="Planas"
                value={quantityLabel(job.quantityUnit, job.quantityPlanned)}
              />
              <ProgressBox
                label="Užfiksuota"
                value={quantityLabel(job.quantityUnit, job.quantityLogged)}
              />
              <ProgressBox
                label="Liko"
                value={quantityLabel(job.quantityUnit, job.remaining)}
                highlight
              />
            </div>

            <div className="flex items-center justify-between rounded-xl border border-stone-line bg-muted/30 px-4 py-3">
              <span className="text-sm text-muted-foreground">Atlikta</span>
              <span className="text-2xl font-semibold tabular-nums">{completionPercent}%</span>
            </div>

            {schedule ? (
              <details className="rounded-xl border border-stone-line bg-muted/20">
                <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-muted-foreground">
                  <span className="inline-flex items-center gap-2">
                    <Cog className="size-4" />
                    Gamybos planas ir paketavimas
                  </span>
                </summary>
                <div className="space-y-4 border-t border-stone-line px-4 py-4">
                  <dl className="grid gap-2 text-sm sm:grid-cols-2">
                    <PlanItem
                      label="Našumas"
                      value={formatPalletRateWithNorm(
                        schedule.dailyRatePallets,
                        schedule.workNormPiecesPerDay,
                      )}
                    />
                    <PlanItem
                      label="Pjovimas"
                      value={formatDurationHours(schedule.productionHours)}
                    />
                    <PlanItem
                      label="Reguliavimas"
                      value={
                        schedule.requiresChangeover
                          ? formatDurationHours(schedule.changeoverHours)
                          : "Nereikia"
                      }
                    />
                    <PlanItem
                      label="Pradžia / pabaiga"
                      value={`${formatScheduleTimestamp(schedule.estimatedStart)} → ${formatScheduleTimestamp(schedule.estimatedEnd)}`}
                    />
                  </dl>
                  <div>
                    <div className="mb-1 flex items-center gap-2 text-sm text-muted-foreground">
                      <Package className="size-4" />
                      Paketavimas
                    </div>
                    <ul className="space-y-0.5 text-sm">
                      {packagingLines.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </details>
            ) : null}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-stone-line xl:sticky xl:top-4 xl:self-start">
          <CardContent className="pt-5">
            <CechasQuickInput job={job} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ProgressBox({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl px-3 py-2.5 text-center ${
        highlight ? "bg-deisida/8 ring-1 ring-deisida/20" : "bg-muted/40"
      }`}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function PlanItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium text-ink">{value}</dd>
    </div>
  );
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2 rounded-xl bg-muted/40 px-3 py-2.5">
      <div className="mt-0.5">{icon}</div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-base font-semibold tabular-nums">{value}</p>
      </div>
    </div>
  );
}
