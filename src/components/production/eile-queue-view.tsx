import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { AiPlanActions, AcceptedPlanBanner } from "@/components/production/ai-plan-actions";
import { EmptyState } from "@/components/production/async-state";
import { PageShell } from "@/components/production/page-shell";
import {
  formatDeadlineDate,
  formatDurationHours,
  formatScheduleEndpoints,
} from "@/lib/queue/format";
import { machineWidthLabel } from "@/lib/queue/machine-width";
import {
  conveyorDisplayLabel,
  formatPalletRateWithNorm,
} from "@/lib/queue/rate-labels";
import { SHOP_MACHINE_ORDER } from "@/lib/queue/constants";
import { formatLockedWeekLabel } from "@/lib/queue/week";
import {
  buildLaneWidthSegments,
  formatChangeoverLabel,
  type LaneWidthSegment,
} from "@/lib/queue/lane-segments";
import { cn } from "@/lib/utils";
import {
  MachineLaneDowntimePanel,
  type DowntimeRow,
} from "@/components/production/machine-downtime-form";
import { MachineLaneWidthPanel } from "@/components/production/machine-lane-width-panel";
import { LazyQueueMoveDetails } from "@/components/production/lazy-queue-move-details";
import { QueueMoveForm } from "@/components/production/queue-move-form";
import { QueueEnqueueForm } from "@/components/production/queue-enqueue-form";
import { ScrollLaneIntoView } from "@/components/production/scroll-lane-into-view";
import type { QueueJob, QueueLane, QueueResponse } from "@/lib/production-types";

interface EileQueueViewProps {
  data: QueueResponse;
  notice?: string | null;
  noticeVariant?: "success" | "error";
  selectedCode?: string;
  confirmed?: string;
  jobsCreated?: string;
  canEdit?: boolean;
  isAdmin?: boolean;
  downtimes?: DowntimeRow[];
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

function parseAiComment(comment: string): { tag: string | null; body: string } {
  const match = comment.match(/^([A-Z0-9]+)\s*[:—-]\s*(.+)$/i);
  if (match) {
    return { tag: match[1].toUpperCase(), body: match[2].trim() };
  }
  return { tag: null, body: comment };
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
  noticeVariant = "success",
  selectedCode,
  confirmed,
  jobsCreated,
  canEdit = false,
  isAdmin = false,
  downtimes = [],
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
  const laterCount = data.laterLockedCount;

  return (
    <PageShell
      title="Gamybinė eilė"
      subtitle="Kitas darbas pagal stakles, plotį ir pjovimo storį (P1/P2/P3)."
      wide
    >
      <ScrollLaneIntoView laneCode={activeCode} />
      {notice && data.planStatus !== "accepted" ? (
        <p
          className={cn(
            "rounded-xl border px-4 py-3 text-sm",
            noticeVariant === "error"
              ? "border-red-200 bg-red-50 text-red-900"
              : "border-stone-line bg-[#eef6ee] text-[#2d5a2d]",
          )}
        >
          {notice}
        </p>
      ) : null}

      {data.lockedWeekStart && data.lockedWeekEnd ? (
        <div className="rounded-2xl border border-stone-line bg-paper px-4 py-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <span className="font-medium text-ink">
              Gamybos planas{" "}
              {formatLockedWeekLabel({
                startIso: data.lockedWeekStart,
                endIso: data.lockedWeekEnd,
              })}
            </span>
            <span className="text-muted-foreground">
              Pradžios pr–pn 08–12 / 13–17 · pabaiga gali tęstis kitą savaitę
            </span>
            <span className="text-muted-foreground">
              {totalJobs} darb. · {lanes.filter((lane) => lane.jobs.length > 0).length}/
              {lanes.length} staklių
            </span>
            {laterCount > 0 ? (
              <span className="text-muted-foreground">
                Po suplanuotos savaitės: {laterCount}
              </span>
            ) : null}
            {(data.unassignedJobs?.length ?? 0) > 0 ? (
              <span className="font-medium text-amber-800">
                Nepriskirti: {data.unassignedJobs.length}
              </span>
            ) : null}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {lanes.map((lane) => {
              const key = laneKey(lane);
              const active = key === activeCode || lane.code === activeCode;
              const count = lane.jobs.length;
              return (
                <Link
                  key={lane.id || key}
                  href={laneHref(key, { confirmed, jobsCreated })}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium no-underline transition",
                    active
                      ? "border-deisida bg-deisida text-deisida-foreground"
                      : count === 0
                        ? "border-amber-200 bg-amber-50 text-amber-900"
                        : "border-stone-line bg-background text-ink hover:border-deisida/40",
                  )}
                >
                  {key}: {count}
                </Link>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-stone-line px-4 py-3 text-sm text-muted-foreground">
          Savaitės planas dar nesugeneruotas. Paleiskite{" "}
          <code>npm run queue:plan</code> (penktadienį 00:00 vis tiek perskaičiuos).
        </p>
      )}

      {data.planStatus === "accepted" ? <AcceptedPlanBanner /> : null}

      {canEdit && data.planStatus !== "accepted" && data.planRunId ? (
        <AiPlanActions
          hasAiNotes={data.aiComments.length > 0}
          rebalance={data.rebalance}
        />
      ) : null}

      {data.aiSource === "claude" &&
      data.aiComments.length > 0 &&
      data.planStatus !== "accepted" ? (
        <div className="rounded-2xl border border-stone-line bg-[#faf8f5] px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-deisida">
            AI pastabos
          </p>
          <ul className="mt-2 space-y-2">
            {data.aiComments.map((comment) => {
              const parsed = parseAiComment(comment);
              return (
                <li
                  key={comment}
                  className="flex gap-2 text-sm leading-relaxed text-ink"
                >
                  {parsed.tag ? (
                    <Badge variant="outline" className="mt-0.5 shrink-0 font-mono text-[11px]">
                      {parsed.tag}
                    </Badge>
                  ) : null}
                  <span>{parsed.body}</span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (data.aiSource === "mock" || data.aiSource === null) && isAdmin ? (
        <AiAuditAdminHelp />
      ) : null}

      {(data.unassignedJobs?.length ?? 0) > 0 ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm font-semibold text-amber-950">
            Nepriskirti darbai ({data.unassignedJobs.length})
          </p>
          <p className="mt-1 text-xs text-amber-900">
            Patvirtinti darbai, dar nepateko į savaitės planą. Pasirinkite terminą ir konvejerį —
            sistema pasiūlys optimalų variantą ir perskaičiuos eilę.
          </p>
          <ul className="mt-3 space-y-2">
            {data.unassignedJobs.map((job) => (
              <li key={job.id}>
                <details className="group rounded-lg border border-amber-200 bg-white">
                  <summary className="cursor-pointer list-none p-3 [&::-webkit-details-marker]:hidden">
                    <p className="text-sm font-medium text-ink">
                      {job.proposalNumber} · {job.widthMm} mm · {job.quantityPlanned}{" "}
                      {job.quantityUnit === "pieces" ? "vnt." : "pal."}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Terminas supjauti: {formatDeadlineDate(job.deadline)}
                    </p>
                    <p className="mt-1 text-xs text-deisida group-open:hidden">
                      Spauskite norėdami įterpti į eilę
                    </p>
                  </summary>
                  {canEdit && data.planStatus !== "accepted" ? (
                    <div className="border-t border-amber-100 px-3 pb-3">
                      <QueueEnqueueForm
                        jobId={job.id}
                        proposalNumber={job.proposalNumber}
                        widthMm={job.widthMm}
                        defaultDeadline={job.deadline}
                        lanes={lanes.map((lane) => ({
                          id: lane.id,
                          label: lane.shopCode || lane.code,
                        }))}
                      />
                    </div>
                  ) : data.planStatus === "accepted" ? (
                    <p className="border-t border-amber-100 px-3 py-2 text-xs text-muted-foreground">
                      Planas užrakintas — pirmiausia atverkite redagavimui.
                    </p>
                  ) : null}
                </details>
              </li>
            ))}
          </ul>
        </div>
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
            className="sticky top-[5.5rem] z-20 -mx-4 border-b border-stone-line bg-background px-4 py-3 sm:-mx-6 sm:px-6 lg:top-[4.5rem]"
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
                  lane.storedWidthMm > 0
                    ? `${lane.storedWidthMm} mm`
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
            <div id="eile-darbai">
            <LaneSection
              lockedWeekEnd={data.lockedWeekEnd}
              lane={selectedLane}
              lanes={lanes}
              canEdit={canEdit}
              isAdmin={isAdmin}
              downtimes={downtimes}
            />
            </div>
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
  isAdmin,
  downtimes,
  lockedWeekEnd,
}: {
  lane: QueueLane;
  lanes: QueueLane[];
  canEdit: boolean;
  isAdmin: boolean;
  downtimes: DowntimeRow[];
  lockedWeekEnd: string | null;
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
          Našumas: {laneRate}
        </Badge>
        <Badge variant="outline">
          Reguliavimas {lane.changeoverMinutes} min.
        </Badge>
        <Badge variant="outline">
          {machineWidthLabel({
            widthMm: lane.storedWidthMm,
            source: lane.widthSource,
          })}
        </Badge>
        {lane.widthHint ? (
          <span className="text-sm text-muted-foreground">{lane.widthHint}</span>
        ) : null}
        <span className="text-sm text-muted-foreground">
          Eilėje rodomi reguliavimo žingsniai, kai baigiasi vienas plotis ir prasideda kitas.
        </span>
      </div>

      {lane.laterJobCount > 0 ? (
        <p className="text-sm text-muted-foreground">
          Dar {lane.laterJobCount} darb. užrakinta — matoma po kito penktadienio.
        </p>
      ) : null}

      {isAdmin ? (
        <>
          <MachineLaneWidthPanel
            machineId={lane.id}
            machineCode={lane.code}
            storedWidthMm={lane.storedWidthMm}
          />
          <MachineLaneDowntimePanel
            machineId={lane.id}
            machineCode={lane.code}
            downtimes={downtimes}
          />
        </>
      ) : null}

      {lane.jobs.length === 0 ? (
        <p className="rounded-xl border border-dashed border-stone-line px-4 py-6 text-base text-muted-foreground">
          Šiose staklėse šią savaitę darbų nėra.
        </p>
      ) : (
        <div className="space-y-5">
          {buildLaneWidthSegments(lane.jobs, lane.storedWidthMm, lane.changeoverMinutes).map(
            (segment, segmentIndex) => (
              <div key={`${segment.widthMm}-${segmentIndex}`} className="space-y-3">
                <ChangeoverStep
                  segment={segment}
                  moveReason={segment.jobs[0]?.schedule?.moveReason}
                />
                <SegmentHeader
                  segment={segment}
                  segmentIndex={segmentIndex}
                  storedWidthMm={lane.storedWidthMm}
                />
                <div className="grid gap-3">
                  {segment.jobs.map((job, jobIndex) => (
                    <LaneJobCard
                      key={job.id}
                      lockedWeekEnd={lockedWeekEnd}
                      job={job}
                      lane={lane}
                      lanes={lanes}
                      canEdit={canEdit}
                      shop={shop}
                      showChangeoverInTimeline={
                        segment.requiresChangeover && jobIndex === 0
                      }
                    />
                  ))}
                </div>
              </div>
            ),
          )}
        </div>
      )}
    </section>
  );
}

function ChangeoverStep({
  segment,
  moveReason,
}: {
  segment: LaneWidthSegment;
  moveReason?: string;
}) {
  if (moveReason) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-amber-500/70 bg-amber-50 px-4 py-3 dark:bg-amber-950/20">
        <p className="text-sm font-semibold text-amber-950 dark:text-amber-100">
          {moveReason}
        </p>
      </div>
    );
  }

  if (!segment.requiresChangeover) {
    return null;
  }

  return (
    <div className="rounded-2xl border-2 border-dashed border-amber-500/70 bg-amber-50 px-4 py-3 dark:bg-amber-950/20">
      <p className="text-sm font-semibold text-amber-950 dark:text-amber-100">
        Sureguliuoti konvejerį: {formatChangeoverLabel(segment.fromWidthMm, segment.widthMm)}
      </p>
      <p className="mt-1 text-sm text-amber-900/85 dark:text-amber-100/80">
        {formatDurationHours(segment.changeoverHours)} · atlieka operatorius · tada pjovimas{" "}
        {segment.widthMm} mm
      </p>
    </div>
  );
}

function SegmentHeader({
  segment,
  segmentIndex,
  storedWidthMm,
}: {
  segment: LaneWidthSegment;
  segmentIndex: number;
  storedWidthMm: number;
}) {
  const isCurrentSetup =
    segmentIndex === 0 &&
    !segment.requiresChangeover &&
    storedWidthMm > 0 &&
    storedWidthMm === segment.widthMm;

  return (
    <div className="flex flex-wrap items-center gap-2 px-1">
      <p className="text-sm font-semibold text-ink">
        Eilė · {segment.widthMm} mm · {segment.jobs.length}{" "}
        {segment.jobs.length === 1 ? "darb." : "darb."}
      </p>
      {isCurrentSetup ? (
        <Badge variant="outline" className="text-xs">
          dabartinis reguliavimas
        </Badge>
      ) : null}
    </div>
  );
}

function LaneJobCard({
  job,
  lane,
  lanes,
  canEdit,
  shop,
  showChangeoverInTimeline,
  lockedWeekEnd,
}: {
  job: QueueJob;
  lane: QueueLane;
  lanes: QueueLane[];
  canEdit: boolean;
  shop: string;
  showChangeoverInTimeline: boolean;
  lockedWeekEnd: string | null;
}) {
  return (
    <Card className="paper-shadow overflow-hidden rounded-2xl border-stone-line">
      <CardContent className="p-0">
        <div className="border-b border-stone-line px-4 py-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 space-y-1">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                #{job.schedule?.positionInQueue ?? "—"} · {shop}
                {job.schedule?.priority ? ` · ${job.schedule.priority}` : ""}
              </p>
              <CardTitle className="text-base font-semibold leading-snug">{job.tileName}</CardTitle>
              <p className="truncate text-sm text-muted-foreground">
                {job.proposalNumber ? `${job.proposalNumber} · ` : ""}
                {job.client}
                {job.object ? ` · ${job.object}` : ""}
              </p>
            </div>
          </div>
        </div>

        {job.schedule ? (
          <div className="border-b border-stone-line bg-muted/20 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-deisida">
              Gamybos laikas ({shop})
            </p>
            {(() => {
              const hasSetup =
                showChangeoverInTimeline && job.schedule.changeoverHours > 0;
              const times = formatScheduleEndpoints(
                hasSetup
                  ? job.schedule.productionStart
                  : job.schedule.estimatedStart,
                job.schedule.estimatedEnd,
              );
              const setupTimes = hasSetup
                ? formatScheduleEndpoints(
                    job.schedule.estimatedStart,
                    job.schedule.productionStart,
                  )
                : null;
              return (
            <dl
              className={cn(
                "mt-2 grid gap-2",
                hasSetup ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-2 lg:grid-cols-3",
              )}
            >
              {hasSetup && setupTimes ? (
                <ScheduleFact
                  label="Reguliavimas nuo"
                  value={setupTimes.start}
                />
              ) : null}
              <ScheduleFact
                label={hasSetup ? "Pjovimas nuo" : "Pradžia"}
                value={times.start}
                emphasis
              />
              <ScheduleFact
                label="Pabaiga"
                value={times.end}
                emphasis
                hint={
                  lockedWeekEnd &&
                  job.schedule.estimatedEnd.slice(0, 10) > lockedWeekEnd
                    ? "Tęsiasi kitą savaitę"
                    : undefined
                }
              />
              <ScheduleFact
                label="Pjovimas"
                value={`${formatDurationHours(job.schedule.productionHours)} · ${quantityText(job.quantityPlanned, job.quantityUnit)}`}
              />
              {hasSetup ? (
                <ScheduleFact
                  label="Viso (su reguliavimu)"
                  value={formatDurationHours(job.schedule.durationHours)}
                />
              ) : null}
            </dl>
              );
            })()}
          </div>
        ) : null}

        <div className="space-y-3 px-4 py-3">
          <div className="flex flex-wrap gap-2">
            <FactPill label="Plotis" value={`${job.widthMm} mm`} />
            <FactPill label="Storis" value={`${job.storisMm} mm`} />
            <FactPill
              label="Kiekis"
              value={quantityText(job.quantityPlanned, job.quantityUnit)}
            />
            <FactPill label="Terminas" value={formatDeadlineDate(job.deadline)} />
          </div>

          {job.schedule ? (
            <LazyQueueMoveDetails
              summary="Detalės ir rankinis perkėlimas"
              className="w-full rounded-xl border border-stone-line bg-muted/20 px-3 py-2 text-sm"
            >
              <dl className="mt-2 grid gap-1.5 sm:grid-cols-2">
                <PlanRow
                  label="Našumas"
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
                  label="Reguliavimas prieš darbą"
                  value={
                    job.schedule.requiresChangeover
                      ? formatDurationHours(job.schedule.changeoverHours)
                      : "Nereikia"
                  }
                />
                <PlanRow label="Prioritetas" value={job.schedule.priority ?? "—"} />
              </dl>
              {job.schedule.assignmentReason ? (
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  {job.schedule.assignmentReason}
                </p>
              ) : null}
              {canEdit && job.schedule.editable ? (
                <QueueMoveForm
                  jobId={job.id}
                  defaultMachineId={lane.id}
                  defaultDeadline={job.deadline}
                  lanes={lanes.map((option) => ({
                    id: option.id,
                    label: option.shopCode || option.code,
                  }))}
                  fetchSuggestions
                />
              ) : null}
            </LazyQueueMoveDetails>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function FactPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-stone-line bg-background px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-medium text-ink">{value}</p>
    </div>
  );
}

function ScheduleFact({
  label,
  value,
  emphasis = false,
  hint,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  hint?: string;
}) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={cn("mt-0.5 text-sm text-ink", emphasis && "font-semibold")}>{value}</dd>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
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
