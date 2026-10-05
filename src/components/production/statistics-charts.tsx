"use client";

import { format, parseISO } from "date-fns";
import { lt } from "date-fns/locale";
import type { DailyStat, HourlyStat, MachineStat } from "@/lib/queue/production-stats";

function formatNumber(n: number): string {
  return n.toLocaleString("lt-LT");
}

function shortDayLabel(isoDate: string): string {
  try {
    return format(parseISO(isoDate), "MMM d", { locale: lt });
  } catch {
    return isoDate.slice(5);
  }
}

interface BarSeries {
  key: string;
  label: string;
  value: number;
  secondary?: number;
  isToday?: boolean;
  muted?: boolean;
}

function VerticalBarChart({
  series,
  normValue,
  normLabel,
  valueLabel = "vnt.",
  emptyHint,
}: {
  series: BarSeries[];
  normValue?: number;
  normLabel?: string;
  valueLabel?: string;
  emptyHint?: string;
}) {
  if (series.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">Duomenų nėra.</p>
    );
  }

  const hasAnyValue = series.some((s) => s.value + (s.secondary ?? 0) > 0);
  const maxValue = Math.max(
    ...series.map((s) => s.value + (s.secondary ?? 0)),
    normValue ?? 0,
    1,
  );

  return (
    <div className="space-y-3">
      <div className="flex h-52 items-end gap-1 sm:gap-2">
        {series.map((item) => {
          const total = item.value + (item.secondary ?? 0);
          const heightPct = total > 0 ? (total / maxValue) * 100 : 0;
          const goodPct = total > 0 ? (item.value / total) * 100 : 100;
          const isEmpty = total === 0;

          return (
            <div
              key={item.key}
              className="flex min-w-0 flex-1 flex-col items-center gap-2"
            >
              <span
                className={`text-[11px] font-medium tabular-nums ${
                  isEmpty ? "text-muted-foreground/70" : "text-ink"
                }`}
              >
                {isEmpty ? "—" : formatNumber(item.value)}
              </span>
              <div className="relative flex w-full flex-1 items-end">
                {normValue && !item.isToday && !item.muted && hasAnyValue ? (
                  <div
                    className="pointer-events-none absolute inset-x-0 border-t-2 border-dashed border-amber-400/70"
                    style={{ bottom: `${(normValue / maxValue) * 100}%` }}
                    title={normLabel}
                  />
                ) : null}
                <div
                  className={`flex w-full flex-col justify-end overflow-hidden rounded-t-md ${
                    item.isToday
                      ? "ring-2 ring-deisida/30"
                      : item.muted || isEmpty
                        ? "bg-muted/50"
                        : ""
                  }`}
                  style={{ height: isEmpty ? "6%" : `${Math.max(heightPct, 4)}%` }}
                >
                  {!isEmpty && item.secondary ? (
                    <div
                      className="w-full bg-amber-400/80"
                      style={{ height: `${100 - goodPct}%` }}
                    />
                  ) : null}
                  {!isEmpty ? (
                    <div
                      className={`w-full ${
                        item.isToday ? "bg-deisida/70" : "bg-deisida"
                      }`}
                      style={{ height: item.secondary ? `${goodPct}%` : "100%" }}
                    />
                  ) : null}
                </div>
              </div>
              <span
                className={`max-w-full truncate text-center text-[10px] sm:text-[11px] ${
                  item.isToday
                    ? "font-semibold text-deisida"
                    : item.muted
                      ? "text-muted-foreground/70"
                      : "text-muted-foreground"
                }`}
              >
                {item.label}
                {item.isToday ? " · šiandien" : ""}
              </span>
            </div>
          );
        })}
      </div>
      {normValue ? (
        <p className="text-xs text-muted-foreground">
          Punktyrinė linija — dienos norma ({formatNumber(normValue)} {valueLabel}
          {normLabel ? `, ${normLabel}` : ""}). Šiandienos stulpelis normos neturi.
        </p>
      ) : null}
      {emptyHint ? (
        <p className="text-xs text-muted-foreground">{emptyHint}</p>
      ) : null}
    </div>
  );
}

function HorizontalBarChart({
  series,
}: {
  series: { key: string; label: string; value: number; sublabel?: string }[];
}) {
  if (series.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">Duomenų nėra.</p>
    );
  }

  const maxValue = Math.max(...series.map((s) => s.value), 1);

  return (
    <div className="space-y-3">
      {series.map((item) => (
        <div key={item.key} className="space-y-1">
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="font-medium text-ink">{item.label}</span>
            <span className="tabular-nums text-muted-foreground">
              {formatNumber(item.value)} vnt.
            </span>
          </div>
          {item.sublabel ? (
            <p className="text-xs text-muted-foreground">{item.sublabel}</p>
          ) : null}
          <div className="h-2.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-deisida transition-all"
              style={{ width: `${(item.value / maxValue) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function DailyProductionChart({
  daily,
  normPerDay,
}: {
  daily: DailyStat[];
  normPerDay: number;
}) {
  const series: BarSeries[] = daily.map((d) => ({
    key: d.date,
    label: shortDayLabel(d.date),
    value: d.goodPieces,
    secondary: d.defectPieces > 0 ? d.defectPieces : undefined,
    isToday: d.isToday,
    muted: d.logCount === 0 && !d.isToday,
  }));

  return (
    <VerticalBarChart
      series={series}
      normValue={normPerDay > 0 ? normPerDay : undefined}
      normLabel="užbaigotos dienos su pjovimu"
      emptyHint="Kiekvienas stulpelis — viena diena pasirinktame laikotarpyje. 0 vnt. reiškia, kad tą dieną ceche nebuvo įrašų."
    />
  );
}

export function HourlyProductionChart({
  hourly,
  todayIso,
}: {
  hourly: HourlyStat[];
  todayIso: string;
}) {
  const series: BarSeries[] = hourly.map((h) => ({
    key: `${h.date}-${h.hour}`,
    label: h.date === todayIso ? `${h.hour} val.` : `${shortDayLabel(h.date)} ${h.hour} val.`,
    value: h.goodPieces,
    secondary: h.defectPieces > 0 ? h.defectPieces : undefined,
    isToday: h.date === todayIso,
  }));

  return <VerticalBarChart series={series} />;
}

export function MachineProductionChart({ machines }: { machines: MachineStat[] }) {
  const series = machines.map((m) => ({
    key: m.machineId,
    label: m.shopCode,
    value: m.goodPieces,
    sublabel: m.machineName,
  }));

  return <HorizontalBarChart series={series} />;
}

export function DefectShareChart({
  good,
  defect,
}: {
  good: number;
  defect: number;
}) {
  const total = good + defect;
  if (total <= 0) {
    return (
      <p className="text-sm text-muted-foreground">Broko nėra — visi įrašai geros produkcijos.</p>
    );
  }

  const defectPct = Math.round((defect / total) * 100);
  const goodPct = 100 - defectPct;

  return (
    <div className="space-y-4">
      <div className="flex h-8 overflow-hidden rounded-full">
        <div
          className="bg-deisida"
          style={{ width: `${goodPct}%` }}
          title={`Gera: ${formatNumber(good)} vnt.`}
        />
        {defectPct > 0 ? (
          <div
            className="bg-amber-500"
            style={{ width: `${defectPct}%` }}
            title={`Brokas: ${formatNumber(defect)} vnt.`}
          />
        ) : null}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="flex items-center gap-2 text-sm">
          <span className="size-3 rounded-full bg-deisida" />
          <span>
            Gera produkcija — <strong>{formatNumber(good)} vnt.</strong> ({goodPct} %)
          </span>
        </div>
        {defect > 0 ? (
          <div className="flex items-center gap-2 text-sm">
            <span className="size-3 rounded-full bg-amber-500" />
            <span>
              Brokas — <strong>{formatNumber(defect)} vnt.</strong> ({defectPct} %)
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
