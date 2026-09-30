import { CalendarDays, Clock, Cog, Layers, Ruler } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/production/async-state";
import { PageShell } from "@/components/production/page-shell";
import {
  formatDeadlineDate,
  formatDurationHours,
  formatScheduleTimestamp,
} from "@/lib/queue/format";
import { machineWidthLabel } from "@/lib/queue/machine-width";
import type { QueueLane, QueueResponse } from "@/lib/production-types";

interface EileQueueViewProps {
  data: QueueResponse;
}

function quantityText(
  count: number,
  unit: "pallets" | "pieces",
): string {
  if (unit === "pallets") {
    return count === 1 ? "1 paletė" : `${count} paletės`;
  }
  return count === 1 ? "1 vnt." : `${count} vnt.`;
}

export function EileQueueView({ data }: EileQueueViewProps) {
  const totalJobs = data.lanes.reduce((sum, lane) => sum + lane.jobs.length, 0);

  return (
    <PageShell
      title="Gamybinė eilė"
      subtitle="Planas pagal konvejerį: plotis → terminas. KONV 240 / KNEW 720 paletės per dieną + reguliavimas."
      wide
    >
      {totalJobs === 0 ? (
        <EmptyState
          title="Eilėje darbų nėra"
          description="Patvirtinti pasiūlymai dar neperkelti į gamybą."
        />
      ) : (
        <div className="space-y-10">
          {data.lanes.map((lane) => (
            <LaneSection key={lane.code} lane={lane} />
          ))}
        </div>
      )}
    </PageShell>
  );
}

function LaneSection({ lane }: { lane: QueueLane }) {
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-semibold text-ink">
          {lane.code} — {lane.name}
        </h2>
        <Badge className="bg-deisida text-deisida-foreground">
          {lane.dailyRatePallets} pal./d.
        </Badge>
        <Badge variant="secondary">
          Rotacija {lane.rotationHours} val.
        </Badge>
        <Badge variant="outline">
          Reguliavimas {lane.changeoverMinutes} min.
        </Badge>
        <Badge variant="outline">
          {machineWidthLabel({
            widthMm: lane.currentWidthMm,
            source: lane.widthSource,
          })}
        </Badge>
        {lane.widthHint ? (
          <span className="text-sm text-muted-foreground">{lane.widthHint}</span>
        ) : null}
      </div>

      {lane.jobs.length === 0 ? (
        <p className="rounded-xl border border-dashed border-stone-line px-4 py-6 text-base text-muted-foreground">
          Šiame konvejeryje šiuo metu darbų nėra.
        </p>
      ) : (
        <div className="grid gap-4">
          {lane.jobs.map((job) => (
            <Card
              key={job.id}
              className="paper-shadow rounded-2xl border-stone-line"
            >
              <CardHeader className="gap-2 border-b border-stone-line pb-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-muted-foreground">
                      #{job.schedule?.positionInQueue ?? "—"} eilėje · {lane.code}
                    </p>
                    <CardTitle className="text-lg font-semibold leading-snug">
                      {job.tileName}
                    </CardTitle>
                  </div>
                  <Badge className="bg-deisida text-deisida-foreground">
                    {lane.code}
                  </Badge>
                </div>
                <p className="text-base text-muted-foreground">
                  {job.proposalNumber ? `${job.proposalNumber} · ` : ""}
                  {job.client}
                  {job.object ? ` · ${job.object}` : ""}
                </p>
                {job.schedule?.assignmentReason ? (
                  <p className="rounded-xl bg-muted/60 px-3 py-2 text-sm leading-relaxed text-ink">
                    {job.schedule.assignmentReason}
                  </p>
                ) : null}
              </CardHeader>
              <CardContent className="grid gap-4 pt-4 lg:grid-cols-2">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Metric
                    icon={<Ruler className="size-4 text-deisida" />}
                    label="Plotis"
                    value={`${job.widthMm} mm`}
                  />
                  <Metric
                    icon={<Layers className="size-4 text-deisida" />}
                    label="Storis"
                    value={`${job.storisMm} mm`}
                  />
                  <Metric
                    icon={<Layers className="size-4 text-deisida" />}
                    label="Kiekis"
                    value={quantityText(job.quantityPlanned, job.quantityUnit)}
                  />
                  <Metric
                    icon={<CalendarDays className="size-4 text-deisida" />}
                    label="Terminas"
                    value={formatDeadlineDate(job.deadline)}
                  />
                </div>

                {job.schedule ? (
                  <div className="rounded-xl border border-stone-line bg-muted/30 p-4">
                    <div className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                      <Cog className="size-4" />
                      Gamybos planas ({lane.code})
                    </div>
                    <dl className="grid gap-2 text-sm sm:grid-cols-2">
                      <PlanRow
                        label="Našumas"
                        value={`${job.schedule.dailyRatePallets} pal./d.`}
                      />
                      <PlanRow
                        label="Paletės"
                        value={`${job.schedule.quantityPallets.toLocaleString("lt-LT", { maximumFractionDigits: 2 })}`}
                      />
                      <PlanRow
                        label="Pjovimas"
                        value={formatDurationHours(job.schedule.productionHours)}
                      />
                      <PlanRow
                        label="Reguliavimas"
                        value={
                          job.schedule.requiresChangeover
                            ? formatDurationHours(job.schedule.changeoverHours)
                            : "Nereikia"
                        }
                      />
                      <PlanRow
                        label="Viso"
                        value={formatDurationHours(job.schedule.durationHours)}
                      />
                      <PlanRow
                        label="Pradžia"
                        value={formatScheduleTimestamp(job.schedule.estimatedStart)}
                      />
                      <PlanRow
                        label="Pabaiga"
                        value={formatScheduleTimestamp(job.schedule.estimatedEnd)}
                      />
                      <PlanRow
                        icon={<Clock className="size-3.5" />}
                        label="Rotacija"
                        value={`${job.schedule.rotationHours} val.`}
                      />
                    </dl>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}

function Metric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
        {icon}
        {label}
      </p>
      <p className="text-base font-medium">{value}</p>
    </div>
  );
}

function PlanRow({
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
      <dd className="font-medium text-ink">{value}</dd>
    </div>
  );
}
