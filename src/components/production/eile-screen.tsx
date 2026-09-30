"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarDays } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/production/async-state";
import { PageShell } from "@/components/production/page-shell";
import { fetchQueue } from "@/lib/production-api";
import type {
  ProductionApiError,
  QueueResponse,
  QueueWidthGroup,
} from "@/lib/production-types";

function formatDeadline(deadline: string): string {
  const date = new Date(deadline);
  if (Number.isNaN(date.getTime())) return deadline;
  return date.toLocaleDateString("lt-LT", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
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

interface EileScreenProps {
  initialData?: QueueResponse;
}

export function EileScreen({ initialData }: EileScreenProps) {
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState<ProductionApiError | null>(null);
  const [groups, setGroups] = useState<QueueWidthGroup[]>(
    initialData?.groups ?? [],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchQueue();
      setGroups(data.groups ?? []);
    } catch (err) {
      setGroups([]);
      setError(err as ProductionApiError);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialData) return;

    let active = true;

    fetchQueue()
      .then((data) => {
        if (!active) return;
        setGroups(data.groups ?? []);
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        setGroups([]);
        setError(err as ProductionApiError);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [initialData]);

  const totalJobs = groups.reduce((sum, group) => sum + group.jobs.length, 0);

  return (
    <PageShell
      title="Gamybinė eilė"
      subtitle="Peržiūra pagal plytelių plotį ir terminą"
      wide
    >
      {loading ? <LoadingState label="Kraunama eilė…" /> : null}

      {!loading && error ? (
        <div className="space-y-4">
          <ErrorState error={error} onRetry={load} />
          {totalJobs === 0 ? (
            <EmptyState
              title="Eilė tuščia"
              description="Kai API bus paruošta, čia matysite sugrupuotus darbus."
            />
          ) : null}
        </div>
      ) : null}

      {!loading && !error && totalJobs === 0 ? (
        <EmptyState
          title="Eilėje darbų nėra"
          description="Patvirtinti pasiūlymai dar neperkelti į gamybą."
        />
      ) : null}

      {!loading && totalJobs > 0 ? (
        <div className="space-y-8">
          {groups.map((group) => (
            <section key={group.widthMm} className="space-y-4">
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-semibold text-ink">
                  Plotis {group.widthMm} mm
                </h2>
                <Badge variant="secondary" className="text-sm">
                  {group.jobs.length}{" "}
                  {group.jobs.length === 1 ? "darbas" : "darbai"}
                </Badge>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                {group.jobs.map((job) => (
                  <Card
                    key={job.id}
                    className="paper-shadow rounded-2xl border-stone-line"
                  >
                    <CardHeader className="gap-2 border-b border-stone-line pb-4">
                      <div className="flex items-start justify-between gap-3">
                        <CardTitle className="text-lg font-semibold leading-snug">
                          {job.tileName}
                        </CardTitle>
                        {job.conveyorCode ? (
                          <Badge className="bg-deisida text-deisida-foreground">
                            {job.conveyorCode}
                          </Badge>
                        ) : null}
                      </div>
                      <p className="text-base text-muted-foreground">
                        {job.proposalNumber ? `${job.proposalNumber} · ` : ""}
                        {job.client}
                        {job.object ? ` · ${job.object}` : ""}
                      </p>
                    </CardHeader>
                    <CardContent className="grid gap-3 pt-4 sm:grid-cols-3">
                      <Metric label="Storis" value={`${job.storisMm} mm`} />
                      <Metric
                        label="Kiekis"
                        value={quantityText(
                          job.quantityPlanned,
                          job.quantityUnit,
                        )}
                      />
                      <div>
                        <p className="text-sm text-muted-foreground">Terminas</p>
                        <p className="flex items-center gap-1.5 text-base font-medium">
                          <CalendarDays className="size-4 text-deisida" />
                          {formatDeadline(job.deadline)}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : null}
    </PageShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-base font-medium">{value}</p>
    </div>
  );
}
