import {
  Package,
  Ruler,
  Layers,
  MapPin,
  Scissors,
  CalendarDays,
  Cog,
  Clock,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatPackagingLines } from "@/lib/packaging-labels";
import {
  formatDeadlineDate,
  formatDurationHours,
  formatScheduleTimestamp,
} from "@/lib/queue/format";
import { formatPalletRateWithNorm } from "@/lib/queue/rate-labels";
import type { ShopJob } from "@/lib/production-types";

const FINISH_REASON_PRESETS = [
  "Trūko medžiagos",
  "Sugadinta paletė / brokas",
  "Įranga sustojo",
  "Klaidingas užsakymas",
  "Kita",
] as const;

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
  const underPlan = job.quantityLogged < job.quantityPlanned;

  return (
    <div className="space-y-5">
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

      <Card className="paper-shadow rounded-2xl border-stone-line">
        <CardHeader className="gap-2 border-b border-stone-line pb-4">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-muted-foreground">
              Artimiausias darbas jūsų įrenginyje
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
          {schedule?.assignmentReason ? (
            <p className="rounded-xl bg-muted/60 px-3 py-2 text-sm leading-relaxed">
              {schedule.assignmentReason}
            </p>
          ) : null}
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
        <CardContent className="space-y-5 pt-5">
          <div className="grid gap-4 sm:grid-cols-2">
            {schedule ? (
              <InfoRow
                icon={<Ruler className="size-5 text-deisida" />}
                label="Plytos plotis"
                value={`${schedule.widthMm} mm`}
              />
            ) : null}
            <InfoRow
              icon={<Ruler className="size-5 text-deisida" />}
              label="Pjovimo storis"
              value={`${job.storisMm} mm`}
            />
            {schedule ? (
              <InfoRow
                icon={<CalendarDays className="size-5 text-deisida" />}
                label="Terminas"
                value={formatDeadlineDate(schedule.deadline)}
              />
            ) : null}
            <InfoRow
              icon={<Scissors className="size-5 text-deisida" />}
              label="Pjūvis (baras)"
              value={job.pjovimas || "Nenurodyta"}
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

          {schedule ? (
            <div className="rounded-xl border border-stone-line bg-muted/30 px-4 py-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Cog className="size-4" />
                Gamybos planas ({schedule.conveyorCode})
              </div>
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <PlanItem
                  label="Našumas (eilėje)"
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
                  label="Viso laikas"
                  value={formatDurationHours(schedule.durationHours)}
                />
                <PlanItem
                  label="Planuojama pradžia"
                  value={formatScheduleTimestamp(schedule.estimatedStart)}
                />
                <PlanItem
                  label="Planuojama pabaiga"
                  value={formatScheduleTimestamp(schedule.estimatedEnd)}
                />
                <PlanItem
                  icon={<Clock className="size-3.5" />}
                  label="Rotacija"
                  value={`${schedule.rotationHours} val.`}
                />
              </dl>
            </div>
          ) : null}

          <div className="rounded-xl bg-muted/60 px-4 py-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Package className="size-4" />
              Skilimų paketavimas ir viduriukai
            </div>
            <ul className="space-y-1 text-base">
              {packagingLines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl border border-stone-line px-4 py-3 text-center">
            <p className="text-sm text-muted-foreground">Atlikta</p>
            <p className="text-3xl font-semibold tabular-nums text-ink">
              {completionPercent}%
            </p>
          </div>
        </CardContent>
      </Card>

      <form
        method="post"
        action={`/api/jobs/${job.id}/pallet`}
        className="w-full"
      >
        <button
          type="submit"
          disabled={job.remaining <= 0}
          className="flex h-16 w-full items-center justify-center rounded-2xl bg-deisida text-lg font-semibold text-deisida-foreground hover:bg-deisida/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          +1 paletė užfiksuota
        </button>
      </form>

      <Card className="rounded-2xl border-stone-line">
        <CardContent className="space-y-4 pt-5">
          <p className="text-base font-medium">Baigti darbą</p>
          <p className="text-sm text-muted-foreground">
            {underPlan
              ? "Neužbaigus viso plano, pasirinkite arba įrašykite priežastį. Mažiau nei 90 % — signalas siunčiamas vadovui."
              : "Jei baigiate anksčiau nei planas, galite nurodyti priežastį (neprivaloma)."}
          </p>
          <form
            method="post"
            action={`/api/jobs/${job.id}/finish`}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="finish-reason-preset" className="text-base">
                Priežastis {underPlan ? "(privaloma)" : "(neprivaloma)"}
              </Label>
              <select
                id="finish-reason-preset"
                name="reasonPreset"
                required={underPlan}
                defaultValue=""
                className="flex h-12 w-full rounded-xl border border-stone-line bg-paper px-3 text-base"
              >
                <option value="" disabled>
                  Pasirinkite priežastį
                </option>
                {FINISH_REASON_PRESETS.map((preset) => (
                  <option key={preset} value={preset}>
                    {preset}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="finish-reason" className="text-base">
                Papildoma informacija
              </Label>
              <Textarea
                id="finish-reason"
                name="reason"
                placeholder="Pvz.: trūko 2 palečių, sugadinta pirmoji paletė…"
                className="min-h-24 text-base"
              />
            </div>
            <button
              type="submit"
              disabled={job.quantityLogged === 0}
              className="flex h-14 w-full items-center justify-center rounded-2xl border border-stone-line bg-paper text-base font-medium hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Baigti darbą
            </button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function PlanItem({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div>
      <dt className="flex items-center gap-1 text-muted-foreground">
        {icon}
        {label}
      </dt>
      <dd className="text-base font-medium text-ink">{value}</dd>
    </div>
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
