"use client";

import { Button } from "@/components/ui/button";
import type { QueueRebalanceInfo } from "@/lib/production-types";

export function AiPlanActions({
  rebalance,
}: {
  hasAiNotes: boolean;
  rebalance: QueueRebalanceInfo | null;
}) {
  const canRebalance = rebalance?.canRebalance ?? false;

  return (
    <div className="rounded-2xl border border-stone-line bg-paper px-4 py-3">
      <p className="text-sm font-medium text-ink">
        {canRebalance
          ? `Galima perkelti ${rebalance?.pendingMoveCount ?? 0} darb.`
          : "Galite patvirtinti planą arba redaguoti ranka."}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <form method="post" action="/api/jobs/queue/rebalance">
          <Button type="submit" size="sm" disabled={!canRebalance}>
            Perskirstyti darbus
          </Button>
        </form>
        <form method="post" action="/api/jobs/queue/accept">
          <Button type="submit" variant="outline" size="sm">
            Patvirtinti be pakeitimų
          </Button>
        </form>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            document.getElementById("eile-darbai")?.scrollIntoView({
              behavior: "smooth",
              block: "start",
            });
          }}
        >
          Redaguoti ranka
        </Button>
      </div>
    </div>
  );
}

export function AcceptedPlanBanner() {
  return (
    <div className="rounded-2xl border border-[#cfe8cf] bg-[#eef6ee] px-4 py-3 text-sm text-[#2d5a2d]">
      <p>
        Planas <strong>patvirtintas be pakeitimų</strong> — staklių apkrova nepasikeitė.
        Jei norėjote perskirstyti (pvz. SK1 → NK1), atverkite planą ir spauskite{" "}
        <strong>Perskirstyti darbus</strong>.
      </p>
      <form method="post" action="/api/jobs/queue/reopen" className="mt-3">
        <Button type="submit" size="sm" variant="outline">
          Atverti planą redagavimui
        </Button>
      </form>
    </div>
  );
}
