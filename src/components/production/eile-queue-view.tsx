"use client";

import { useMemo, useState } from "react";
import { CalendarDays, Cog, Layers, Ruler } from "lucide-react";
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
import {
  conveyorDisplayLabel,
  formatPalletRateWithNorm,
} from "@/lib/queue/rate-labels";
import { cn } from "@/lib/utils";
import type { QueueLane, QueueResponse } from "@/lib/production-types";

interface EileQueueViewProps {
  data: QueueResponse;
  notice?: string | null;
}

const LANE_ORDER = ["KONV", "KNEW"];

function quantityText(
  count: number,
  unit: "pallets" | "pieces",
): string {
  if (unit === "pallets") {
    return count === 1 ? "1 paletė" : `${count} paletės`;
  }
  return count === 1 ? "1 vnt." : `${count} vnt.`;
}

function sortLanes(lanes: QueueLane[]): QueueLane[] {
  return [...lanes].sort((left, right) => {
    const leftIndex = LANE_ORDER.indexOf(left.code);
    const rightIndex = LANE_ORDER.indexOf(right.code);
    return (leftIndex === -1 ? 99 : leftIndex) - (rightIndex === -1 ? 99 : rightIndex);
  });
}

function defaultLaneCode(lanes: QueueLane[]): string {
  const withJobs = lanes.find((lane) => lane.jobs.length > 0);
  if (withJobs) {
    return withJobs.code;
  }
  return lanes.find((lane) => lane.code === "KONV")?.code ?? lanes[0]?.code ?? "KONV";
}

export function EileQueueView({ data, notice }: EileQueueViewProps) {
  const lanes = useMemo(() => sortLanes(data.lanes), [data.lanes]);
  const totalJobs = lanes.reduce((sum, lane) => sum + lane.jobs.length, 0);
  const [selectedCode, setSelectedCode] = useState(() => defaultLaneCode(lanes));
  const selectedLane =
    lanes.find((lane) => lane.code === selectedCode) ?? lanes[0] ?? null;

  return (
    <PageShell
      title="Gamybinė eilė"
      subtitle="Kitas darbas pagal konvejerį ir plotį."
      wide
    >
      {notice ? (
        <p className="rounded-xl border border-stone-line bg-[#eef6ee] px-4 py-3 text-sm text-[#2d5a2d]">
          {notice}
        </p>
      ) : null}
      {totalJobs === 0 ? (
        <EmptyState
          title="Eilėje darbų nėra"
          description="Patvirtinti pasiūlymai dar neperkelti į gamybą."
        />
      ) : (
        <div className="space-y-6">
          <div className="sticky top-0 z-20 -mx-4 border-b border-stone-line bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Konvejeriai">
              {lanes.map((lane) => {
                const active = lane.code === selectedLane?.code;
                const rate = formatPalletRateWithNorm(
                  lane.dailyRatePallets,
                  lane.workNormPiecesPerDay,
                );
                const widthText =
                  lane.currentWidthMm > 0
                    ? `${lane.currentWidthMm} mm`
                    : "nereguliuotas";

                return (
                  <button
                    key={lane.code}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setSelectedCode(lane.code)}
                    className={cn(
                      "min-w-[11rem] flex-1 rounded-2xl border px-4 py-3 text-left transition sm:flex-none",
                      active
                        ? "border-deisida bg-deisida text-deisida-foreground shadow-sm"
                        : "border-stone-line bg-paper text-ink hover:border-deisida/50",
                    )}
                  >
                    <span className="block text-base font-semibold">
                      {lane.code}
                      <span className="font-normal opacity-80"> · {widthText}</span>
                    </span>
                    <span className="mt-1 block text-sm opacity-90">{rate}</span>
                  </button>
                );
              })}
            </div>
          </div>
          {selectedLane ? <LaneSection lane={selectedLane} /> : null}
        </div>
      )}
    </PageShell>
  );
}

function LaneSection({ lane }: { lane: QueueLane }) {
  const laneLabel = conveyorDisplayLabel(lane.code, lane.name);
  const laneRate = formatPalletRateWithNorm(
    lane.dailyRatePallets,
    lane.workNormPiecesPerDay,
  );

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-semibold text-ink">{laneLabel}</h2>
        <Badge className="bg-deisida text-deisida-foreground">
          Našumas (eilėje): {laneRate}
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
                        label="Našumas (eilėje)"
                        value={formatPalletRateWithNorm(
                          job.schedule.dailyRatePallets,
                          job.schedule.workNormPiecesPerDay,
                        )}
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
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium text-ink">{value}</dd>
    </div>
  );
}
