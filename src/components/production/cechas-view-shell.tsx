"use client";

import { useState } from "react";
import { CalendarDays, X } from "lucide-react";
import { CechasWeekQueue } from "@/components/production/cechas-week-queue";
import type { QueueJob } from "@/lib/production-types";

interface CechasViewShellProps {
  children: React.ReactNode;
  jobs: QueueJob[];
  currentJobId?: string;
  lockedWeekStart: string | null;
  lockedWeekEnd: string | null;
  conveyorShopCode?: string;
}

export function CechasViewShell({
  children,
  jobs,
  currentJobId,
  lockedWeekStart,
  lockedWeekEnd,
  conveyorShopCode,
}: CechasViewShellProps) {
  const [showWeek, setShowWeek] = useState(false);

  return (
    <>
      <div className="mb-4 flex justify-end">
        <button
          type="button"
          onClick={() => setShowWeek((v) => !v)}
          className="inline-flex items-center gap-2 rounded-xl border border-stone-line bg-paper px-4 py-2.5 text-sm font-medium hover:bg-muted/60"
        >
          {showWeek ? (
            <>
              <X className="size-4" />
              Grįžti prie darbo
            </>
          ) : (
            <>
              <CalendarDays className="size-4 text-deisida" />
              Savaitės darbai
              {jobs.length > 0 ? (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
                  {jobs.length}
                </span>
              ) : null}
            </>
          )}
        </button>
      </div>

      {showWeek ? (
        <CechasWeekQueue
          jobs={jobs}
          currentJobId={currentJobId}
          lockedWeekStart={lockedWeekStart}
          lockedWeekEnd={lockedWeekEnd}
          conveyorShopCode={conveyorShopCode}
        />
      ) : (
        children
      )}
    </>
  );
}
