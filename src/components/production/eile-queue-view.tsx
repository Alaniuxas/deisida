import Link from "next/link";
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
import { SHOP_MACHINE_ORDER } from "@/lib/queue/constants";
import { formatLockedWeekLabel } from "@/lib/queue/week";
import { cn } from "@/lib/utils";
import type { QueueLane, QueueResponse } from "@/lib/production-types";

interface EileQueueViewProps {
  data: QueueResponse;
  notice?: string | null;
  selectedCode?: string;
  confirmed?: string;
  jobsCreated?: string;
  canEdit?: boolean;
  isAdmin?: boolean;
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

function laneKey(lane: QueueLane): string {
  return lane.shopCode || lane.code;
}

function sortLanes(lanes: QueueLane[]): QueueLane[] {
  return [...lanes].sort((left, right) => {
    const leftIndex = (SHOP_MACHINE_ORDER as readonly string[]).indexOf(
      laneKey(left),
    );
    const rightIndex = (SHOP_MACHINE_ORDER as readonly string[]).indexOf(
      laneKey(right),
    );
    return (leftIndex === -1 ? 99 : leftIndex) - (rightIndex === -1 ? 99 : rightIndex);
  });
}

function defaultLaneCode(lanes: QueueLane[]): string {
  const withJobs = lanes.find((lane) => lane.jobs.length > 0);
  if (withJobs) {
    return laneKey(withJobs);
  }
  return lanes[0] ? laneKey(lanes[0]) : "NK1";
}

function laneHref(
  code: string,
  extras: { confirmed?: string; jobsCreated?: string },
): string {
  const params = new URLSearchParams();
  params.set("konvejeris", code);
  if (extras.confirmed) params.set("confirmed", extras.confirmed);
  if (extras.jobsCreated) params.set("jobs", extras.jobsCreated);
  return `/eile?${params.toString()}`;
}

export function EileQueueView({
  data,
  notice,
  selectedCode,
  confirmed,
  jobsCreated,
  canEdit = false,
  isAdmin = false,
}: EileQueueViewProps) {
  const lanes = sortLanes(data.lanes);
  const totalJobs = lanes.reduce((sum, lane) => sum + lane.jobs.length, 0);
  const requested = selectedCode?.trim().toUpperCase();
  const activeCode = lanes.some((lane) => laneKey(lane) === requested || lane.code === requested)
    ? (lanes.find((lane) => laneKey(lane) === requested || lane.code === requested)
        ? laneKey(
            lanes.find((lane) => laneKey(lane) === requested || lane.code === requested)!,
          )
        : defaultLaneCode(lanes))
    : defaultLaneCode(lanes);
  const selectedLane =
    lanes.find((lane) => laneKey(lane) === activeCode || lane.code === activeCode) ??
    lanes[0] ??
    null;
  const laterCount =
    data.laterLockedCount +
    lanes.reduce((sum, lane) => sum + (lane.laterJobCount ?? 0), 0) / 2;

  return (
    <PageShell
      title="Gamybinė eilė"
      subtitle="Kitas darbas pagal stakles, plotį ir pjovimo storį (P1/P2/P3)."
      wide
    >
      {notice ? (
        <p className="rounded-xl border border-stone-line bg-[#eef6ee] px-4 py-3 text-sm text-[#2d5a2d]">
          {notice}
        </p>
      ) : null}

      {data.lockedWeekStart && data.lockedWeekEnd ? (
        <p className="rounded-xl border border-stone-line bg-muted/40 px-4 py-3 text-sm text-ink">
          Rodoma tik užrakinta savaitė{" "}
          <strong>
            {formatLockedWeekLabel({
              startIso: data.lockedWeekStart,
              endIso: data.lockedWeekEnd,
            })}
          </strong>
          . Toliau — po kito penktadienio 00:00 (Vilnius).
          {laterCount > 0
            ? ` Už horizonto: ${data.laterLockedCount} darb.`
            : ""}
        </p>
      ) : (
        <p className="rounded-xl border border-dashed border-stone-line px-4 py-3 text-sm text-muted-foreground">
          Savaitės planas dar nesugeneruotas. Paleiskite{" "}
          <code>npm run queue:plan</code> (penktadienį 00:00 vis tiek perskaičiuos).
        </p>
      )}

      {data.aiSource === "claude" && data.aiComments.length > 0 ? (
        <div className="rounded-xl border border-stone-line bg-paper px-4 py-3 text-sm">
          <p className="mb-2 font-medium text-ink">AI pastabos (Claude)</p>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            {data.aiComments.map((comment) => (
              <li key={comment}>{comment}</li>
            ))}
          </ul>
        </div>
      ) : (data.aiSource === "mock" || data.aiSource === null) && isAdmin ? (
        <AiAuditAdminHelp />
      ) : null}

      {totalJobs === 0 ? (
        <EmptyState
          title="Šią savaitę darbų nėra"
          description="Patvirtinti pasiūlymai dar neperkelti į gamybą, arba jie už užrakintos savaitės."
        />
      ) : (
        <div className="space-y-6">
          <nav
            aria-label="Staklės"
            className="sticky top-0 z-30 isolate -mx-4 border-b border-stone-line bg-background px-4 py-3 sm:-mx-6 sm:px-6"
          >
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {lanes.map((lane) => {
                const key = laneKey(lane);
                const active = key === laneKey(selectedLane ?? lane) && lane.id === selectedLane?.id
                  ? true
                  : key === activeCode || lane.code === activeCode;
                const rate = formatPalletRateWithNorm(
                  lane.dailyRatePallets,
                  lane.workNormPiecesPerDay,
                );
                const widthText =
                  lane.currentWidthMm > 0
                    ? `${lane.currentWidthMm} mm`
                    : "nereguliuotas";

                return (
                  <Link
                    key={lane.id || key}
                    href={laneHref(key, { confirmed, jobsCreated })}
                    scroll={false}
                    prefetch
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "relative z-10 pointer-events-auto min-h-[4.5rem] rounded-2xl border px-4 py-3 text-left no-underline transition",
                      active
                        ? "border-deisida bg-deisida text-deisida-foreground shadow-sm"
                        : "border-stone-line bg-paper text-ink hover:border-deisida/50",
                    )}
                  >
                    <span className="block text-base font-semibold leading-snug">
                      {key}
                    </span>
                    <span className="mt-1 block text-sm opacity-90">
                      {widthText} · {lane.jobs.length} darb.
                    </span>
                    <span className="mt-1 block text-sm opacity-90">{rate}</span>
                  </Link>
                );
              })}
            </div>
          </nav>
          {selectedLane ? (
            <LaneSection
              lane={selectedLane}
              lanes={lanes}
              canEdit={canEdit}
            />
          ) : null}
        </div>
      )}
    </PageShell>
  );
}

function AiAuditAdminHelp() {
  return (
    <details className="mt-3 rounded-lg border border-stone-line bg-muted/40 px-3 py-2">
      <summary className="cursor-pointer font-medium text-ink">
        Kaip įjungti Claude AI patarimus (administratoriui)
      </summary>
      <ol className="mt-2 list-decimal space-y-2 pl-5 text-muted-foreground">
        <li>
          Gaukite API raktą iš{" "}
          <a
            href="https://console.anthropic.com/settings/keys"
            target="_blank"
            rel="noopener noreferrer"
            className="text-deisida underline"
          >
            Anthropic Console
          </a>
          .
        </li>
        <li>
          Vietiniam paleidimui nukopijuokite{" "}
          <code className="rounded bg-paper px-1">.env.example</code> į{" "}
          <code className="rounded bg-paper px-1">.env.local</code> ir įrašykite{" "}
          <code className="rounded bg-paper px-1">ANTHROPIC_API_KEY=sk-ant-…</code>.
        </li>
        <li>
          Tikrą raktą niekada nekomituokite į git. Po pakeitimo perkraukite{" "}
          <code className="rounded bg-paper px-1">npm run dev</code>.
        </li>
      </ol>
    </details>
  );
}

function LaneSection({
  lane,
  lanes,
  canEdit,
}: {
  lane: QueueLane;
  lanes: QueueLane[];
  canEdit: boolean;
}) {
  const shop = lane.shopCode || lane.code;
  const laneLabel = conveyorDisplayLabel(shop, lane.name);
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

      {lane.laterJobCount > 0 ? (
        <p className="text-sm text-muted-foreground">
          Dar {lane.laterJobCount} darb. užrakinta — matoma po kito penktadienio.
        </p>
      ) : null}

      {lane.jobs.length === 0 ? (
        <p className="rounded-xl border border-dashed border-stone-line px-4 py-6 text-base text-muted-foreground">
          Šiose staklėse šią savaitę darbų nėra.
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
                      #{job.schedule?.positionInQueue ?? "—"} eilėje · {shop}
                      {job.schedule?.priority ? ` · ${job.schedule.priority}` : ""}
                    </p>
                    <CardTitle className="text-lg font-semibold leading-snug">
                      {job.tileName}
                    </CardTitle>
                  </div>
                  <Badge className="bg-deisida text-deisida-foreground">
                    {shop}
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
                      Gamybos planas ({shop})
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
                    {canEdit && job.schedule.editable ? (
                      <form
                        method="post"
                        action="/api/jobs/queue/override"
                        className="mt-4 space-y-2 border-t border-stone-line pt-3"
                      >
                        <input type="hidden" name="jobId" value={job.id} />
                        <label className="block text-sm text-muted-foreground">
                          Perkelti šią savaitę
                          <select
                            name="machineId"
                            className="mt-1 h-10 w-full rounded-md border border-stone-line bg-paper px-2 text-sm"
                            defaultValue={lane.id}
                          >
                            {lanes.map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.shopCode || option.code}
                              </option>
                            ))}
                          </select>
                        </label>
                        <input
                          name="reason"
                          required
                          placeholder="Priežastis"
                          className="h-10 w-full rounded-md border border-stone-line bg-paper px-3 text-sm"
                        />
                        <button
                          type="submit"
                          className="h-10 rounded-md bg-deisida px-4 text-sm font-medium text-deisida-foreground"
                        >
                          Išsaugoti perkėlimą
                        </button>
                      </form>
                    ) : !job.schedule.editable && canEdit ? (
                      <p className="mt-3 text-xs text-muted-foreground">
                        Šio darbo keisti negalima — ne užrakintoje savaitėje.
                      </p>
                    ) : null}
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
