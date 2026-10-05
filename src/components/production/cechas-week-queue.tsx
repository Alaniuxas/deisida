import { CalendarDays, Ruler } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDeadlineDate, formatScheduleTimestamp } from "@/lib/queue/format";
import type { QueueJob } from "@/lib/production-types";

interface CechasWeekQueueProps {
  jobs: QueueJob[];
  currentJobId?: string;
  lockedWeekStart: string | null;
  lockedWeekEnd: string | null;
  conveyorShopCode?: string;
}

export function CechasWeekQueue({
  jobs,
  currentJobId,
  lockedWeekStart,
  lockedWeekEnd,
  conveyorShopCode,
}: CechasWeekQueueProps) {
  const weekLabel =
    lockedWeekStart && lockedWeekEnd
      ? `${formatDeadlineDate(lockedWeekStart)} – ${formatDeadlineDate(lockedWeekEnd)}`
      : "Ši savaitė";

  return (
    <Card className="rounded-2xl border-stone-line">
      <CardHeader className="gap-1 border-b border-stone-line pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <CalendarDays className="size-4 text-deisida" />
          Savaitės darbai
          {conveyorShopCode ? (
            <Badge variant="outline" className="ml-1">{conveyorShopCode}</Badge>
          ) : null}
        </CardTitle>
        <p className="text-xs text-muted-foreground">{weekLabel}</p>
      </CardHeader>
      <CardContent className="max-h-[calc(100vh-12rem)] overflow-y-auto p-0">
        {jobs.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">
            Šiuo metu eilėje darbų nėra.
          </p>
        ) : (
          <ol className="divide-y divide-stone-line">
            {jobs.map((job, index) => {
              const isCurrent = job.id === currentJobId;
              const schedule = job.schedule;
              return (
                <li
                  key={job.id}
                  className={`px-4 py-3 ${isCurrent ? "bg-deisida/8 ring-1 ring-inset ring-deisida/20" : ""}`}
                >
                  <div className="flex items-start gap-2">
                    <span
                      className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums ${
                        isCurrent
                          ? "bg-deisida text-deisida-foreground"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">
                        {job.tileName}
                      </p>
                      {job.proposalNumber ? (
                        <p className="truncate text-xs text-muted-foreground">
                          {job.proposalNumber}
                        </p>
                      ) : null}
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-0.5">
                          <Ruler className="size-3" />
                          {job.widthMm} mm
                        </span>
                        <span>{formatDeadlineDate(job.deadline)}</span>
                      </div>
                      {schedule ? (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {formatScheduleTimestamp(schedule.estimatedStart)}
                          {" → "}
                          {formatScheduleTimestamp(schedule.estimatedEnd)}
                        </p>
                      ) : null}
                      {isCurrent ? (
                        <Badge className="mt-1.5 bg-deisida text-deisida-foreground text-[10px]">
                          Dabar
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
