"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Calendar,
  CheckCircle2,
  Clock,
  Cog,
  LayoutGrid,
  List,
  Loader2,
  Users,
} from "lucide-react";
import { LithuanianDatePicker } from "@/components/lithuanian-date-picker";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DailyProductionChart,
  DefectShareChart,
  HourlyProductionChart,
  MachineProductionChart,
} from "@/components/production/statistics-charts";
import { StatisticsSearchSelect } from "@/components/production/statistics-search-select";
import { formatLtDate } from "@/lib/proposal-utils";
import type { ProductionStats } from "@/lib/queue/production-stats";

type StatsView = "charts" | "numbers";

function formatNumber(n: number): string {
  return n.toLocaleString("lt-LT");
}

function formatLtDateRange(from: string, to: string): string {
  if (from === to) return formatLtDate(from);
  return `${formatLtDate(from)} – ${formatLtDate(to)}`;
}

function formatLtHour(date: string, hour: number): string {
  return `${formatLtDate(date)}, ${hour} val.`;
}

function describeNormPerformance(
  good: number,
  expected: number,
): { text: string; ok: boolean } {
  if (expected <= 0) {
    return { text: "Norma šiam laikotarpiui nenustatyta.", ok: true };
  }
  const pct = Math.round((good / expected) * 100);
  if (pct >= 90) {
    return { text: `Norma pasiekta — ${pct} % nuo tikėtino kiekio.`, ok: true };
  }
  return {
    text: `Žemiau normos — pasiekta tik ${pct} % nuo tikėtino kiekio (reikia ≥ 90 %).`,
    ok: false,
  };
}

function palletWord(count: number): string {
  if (count === 1) return "paletės įrašas";
  return "paletės įrašai";
}

function defaultDateRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

export function StatisticsScreen() {
  const [range, setRange] = useState(defaultDateRange);
  const [machineId, setMachineId] = useState<string>("");
  const [workerId, setWorkerId] = useState<string>("");
  const [view, setView] = useState<StatsView>("charts");
  const [stats, setStats] = useState<ProductionStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        from: range.from,
        to: range.to,
      });
      if (machineId) params.set("machine", machineId);
      if (workerId) params.set("worker", workerId);

      const response = await fetch(`/api/admin/statistics?${params}`);
      if (!response.ok) throw new Error("Nepavyko užkrauti statistikos.");
      const data = await response.json();
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Klaida");
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to, machineId, workerId]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const summary = useMemo(() => {
    if (!stats) return null;

    const period = formatLtDateRange(stats.dateFrom, stats.dateTo);
    const machineLabel = stats.filters.machineId
      ? stats.availableFilters.machines.find((m) => m.id === stats.filters.machineId)?.label
      : null;
    const workerLabel = stats.filters.workerId
      ? stats.availableFilters.workers.find((w) => w.id === stats.filters.workerId)?.label
      : null;

    const expectedPerDay = stats.daily[0]?.expectedPieces ?? 0;
    const expectedCompleted = expectedPerDay * stats.completedWorkDays;
    const completedNorm =
      stats.completedWorkDays > 0 && stats.completedGood > 0
        ? describeNormPerformance(stats.completedGood, expectedCompleted)
        : null;

    const scopeParts: string[] = [];
    if (machineLabel) scopeParts.push(`konvejeryje ${machineLabel}`);
    if (workerLabel) scopeParts.push(`darbuotojo ${workerLabel} darbas`);
    const scope =
      scopeParts.length > 0 ? ` ${scopeParts.join(", ")}` : " visoje gamyboje";

    const parts: string[] = [];

    if (stats.todayGood > 0) {
      parts.push(
        `Šiandien (${formatLtDate(stats.todayIso)})${scope} jau supjauta ${formatNumber(stats.todayGood)} vnt.${
          stats.todayDefect > 0
            ? `, broko ${formatNumber(stats.todayDefect)} vnt.`
            : ", be broko"
        }. Diena dar vyksta — normos vertinimo nedarome.`,
      );
    }

    if (stats.completedGood > 0) {
      const defectText =
        stats.completedDefect > 0
          ? `, broko ${formatNumber(stats.completedDefect)} vnt.`
          : ", be broko";
      parts.push(
        `Užbaigtose dienose (${stats.completedWorkDays} d.)${scope} supjauta ${formatNumber(stats.completedGood)} vnt.${defectText}.`,
      );
    }

    if (stats.totalLogs === 0) {
      parts.push("Per pasirinktą laikotarpį ceche dar nebuvo įrašyta jokių paletės duomenų.");
    }

    return {
      period,
      machineLabel,
      workerLabel,
      completedNorm,
      expectedPerDay,
      narrative: parts.join(" "),
      hasCompleted: stats.completedGood > 0,
    };
  }, [stats]);

  const activeDays = useMemo(
    () => stats?.daily.filter((day) => day.logCount > 0) ?? [],
    [stats],
  );

  const activeWorkers = useMemo(
    () => stats?.byWorker.filter((worker) => worker.logCount > 0) ?? [],
    [stats],
  );

  const showAlerts = (stats?.underNormAlerts.length ?? 0) > 0;
  const showCompletedStatus =
    summary?.hasCompleted && summary.completedNorm && stats && stats.completedGood > 0;

  return (
    <div className="min-h-full bg-background">
      <header className="border-b border-stone-line bg-paper px-6 py-4 lg:px-10">
        <div className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold text-ink">Gamybos statistika</h1>
              <p className="text-sm text-muted-foreground">
                Paletės įrašų suvestinė — tempas, brokas ir normų atitikimas
              </p>
            </div>
            {summary ? (
              <p className="text-sm text-muted-foreground lg:text-right">
                Rodoma: <span className="font-medium text-ink">{summary.period}</span>
                {summary.machineLabel ? <> · {summary.machineLabel}</> : null}
                {summary.workerLabel ? <> · {summary.workerLabel}</> : null}
              </p>
            ) : null}
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(180px,1fr)_minmax(180px,1fr)_minmax(220px,1.2fr)_minmax(200px,1fr)_auto] xl:items-end">
            <FilterField label="Nuo">
              <LithuanianDatePicker
                value={range.from}
                onChange={(value) => setRange((current) => ({ ...current, from: value }))}
              />
            </FilterField>
            <FilterField label="Iki">
              <LithuanianDatePicker
                value={range.to}
                onChange={(value) => setRange((current) => ({ ...current, to: value }))}
              />
            </FilterField>
            <StatisticsSearchSelect
              id="stats-machine"
              label="Konvejeris / staklė"
              placeholder="Ieškoti staklės…"
              allLabel="Visos staklės"
              options={stats?.availableFilters.machines ?? []}
              value={machineId}
              onChange={setMachineId}
            />
            <StatisticsSearchSelect
              id="stats-worker"
              label="Darbuotojas"
              placeholder="Ieškoti darbuotojo…"
              allLabel="Visi darbuotojai"
              options={stats?.availableFilters.workers ?? []}
              value={workerId}
              onChange={setWorkerId}
            />
            <button
              type="button"
              onClick={loadStats}
              disabled={loading}
              className="h-10 rounded-lg bg-deisida px-5 text-sm font-medium text-deisida-foreground hover:bg-deisida/90 disabled:opacity-50"
            >
              {loading ? <Loader2 className="size-4 animate-spin" /> : "Atnaujinti"}
            </button>
          </div>

          <ViewToggle view={view} onChange={setView} />
        </div>
      </header>

      <main className="px-6 py-6 lg:px-10">
        {error ? (
          <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-destructive">
            {error}
          </p>
        ) : null}

        {loading && !stats ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
          </div>
        ) : null}

        {stats && summary ? (
          <div className="space-y-6">
            <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
              <Card className="rounded-2xl border-stone-line">
                <CardContent className="space-y-3 pt-6">
                  <div className="flex items-start gap-4">
                    <div className="rounded-xl bg-muted/60 p-3">
                      <BarChart3 className="size-6 text-deisida" />
                    </div>
                    <div className="space-y-2">
                      <p className="text-base leading-relaxed text-ink">{summary.narrative}</p>
                      {stats.totalLogs > 0 ? (
                        <p className="text-sm text-muted-foreground">
                          Iš viso {stats.totalLogs} {palletWord(stats.totalLogs)} per{" "}
                          {summary.period.toLowerCase()}.
                        </p>
                      ) : null}
                      {showCompletedStatus && summary.completedNorm ? (
                        <p
                          className={`text-sm font-medium ${
                            summary.completedNorm.ok ? "text-emerald-700" : "text-amber-800"
                          }`}
                        >
                          Užbaigtos dienos: {summary.completedNorm.text}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-2xl border-stone-line">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Gera vs brokas</CardTitle>
                </CardHeader>
                <CardContent>
                  <DefectShareChart good={stats.totalGood} defect={stats.totalDefect} />
                </CardContent>
              </Card>
            </div>

            {stats.todayGood > 0 && stats.completedGood === 0 ? (
              <TodayBanner good={stats.todayGood} defect={stats.todayDefect} />
            ) : null}

            {view === "numbers" ? (
              <NumbersView
                stats={stats}
                summary={summary}
                activeDays={activeDays}
                activeWorkers={activeWorkers}
                showAlerts={showAlerts}
                showCompletedStatus={Boolean(showCompletedStatus)}
              />
            ) : (
              <ChartsView stats={stats} summary={summary} />
            )}
          </div>
        ) : null}
      </main>
    </div>
  );
}

function ViewToggle({
  view,
  onChange,
}: {
  view: StatsView;
  onChange: (view: StatsView) => void;
}) {
  return (
    <div className="inline-flex rounded-xl border border-stone-line bg-muted/30 p-1">
      <ViewButton
        active={view === "charts"}
        onClick={() => onChange("charts")}
        icon={<LayoutGrid className="size-4" />}
        label="Grafikai"
      />
      <ViewButton
        active={view === "numbers"}
        onClick={() => onChange("numbers")}
        icon={<List className="size-4" />}
        label="Skaičiai"
      />
    </div>
  );
}

function ViewButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
        active
          ? "bg-paper text-ink shadow-sm"
          : "text-muted-foreground hover:text-ink"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function ChartsView({
  stats,
  summary,
}: {
  stats: ProductionStats;
  summary: {
    expectedPerDay: number;
  };
}) {
  return (
    <div className="space-y-6">
      <Section
        title="Grafikas per dienas"
        icon={<Calendar className="size-4" />}
        description="Kiekvienas stulpelis — viena pasirinkto laikotarpio diena. Rodo, kiek tą dieną ceche buvo įrašyta supjauta (0 = įrašų nebuvo)."
      >
        <DailyProductionChart daily={stats.daily} normPerDay={summary.expectedPerDay} />
      </Section>

      {stats.hourly.length > 0 ? (
        <Section
          title="Grafikas per valandas"
          icon={<Clock className="size-4" />}
          description="Kada ceche registruojama produkcija. Šiandienos valandos be normos palyginimo."
        >
          <HourlyProductionChart hourly={stats.hourly} todayIso={stats.todayIso} />
        </Section>
      ) : null}

      {!stats.filters.machineId ? (
        <Section
          title="Konvejeriai ir staklės"
          icon={<Cog className="size-4" />}
          description="Visos staklės pasirinktame laikotarpyje — net ir be įrašų."
        >
          <MachineProductionChart machines={stats.byMachine} />
        </Section>
      ) : null}
    </div>
  );
}

function NumbersView({
  stats,
  summary,
  activeDays,
  activeWorkers,
  showAlerts,
  showCompletedStatus,
}: {
  stats: ProductionStats;
  summary: {
    completedNorm: { text: string; ok: boolean } | null;
    expectedPerDay: number;
    hasCompleted: boolean;
  };
  activeDays: ProductionStats["daily"];
  activeWorkers: ProductionStats["byWorker"];
  showAlerts: boolean;
  showCompletedStatus: boolean;
}) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Iš viso supjauta" value={`${formatNumber(stats.totalGood)} vnt.`} />
        <MetricCard
          label="Šiandien"
          value={
            stats.todayGood > 0 ? `${formatNumber(stats.todayGood)} vnt.` : "Dar nėra įrašų"
          }
        />
        <MetricCard
          label="Užbaigtos dienos"
          value={`${formatNumber(stats.completedGood)} vnt.`}
        />
        <MetricCard
          label="Brokas"
          value={stats.totalDefect > 0 ? `${formatNumber(stats.totalDefect)} vnt.` : "Nėra"}
          warn={stats.totalDefect > 0}
        />
      </div>

      {showCompletedStatus && summary.completedNorm ? (
        <StatusBanner ok={summary.completedNorm.ok} hasAlerts={showAlerts} />
      ) : null}

      {showAlerts ? (
        <Card className="rounded-2xl border-amber-300 bg-amber-50">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base text-amber-900">
              <AlertTriangle className="size-4" />
              Reikia dėmesio (tik užbaigtos dienos)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-amber-950">
              {stats.underNormAlerts.slice(0, 12).map((alert, i) => (
                <li key={`${alert.type}-${alert.label}-${i}`} className="flex gap-2">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-amber-600" />
                  <AlertExplanation alert={alert} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : showCompletedStatus && summary.completedNorm?.ok ? (
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4">
          <CheckCircle2 className="size-5 shrink-0 text-emerald-700" />
          <p className="text-sm text-emerald-900">
            Užbaigtų dienų gamybos tempas atitinka normą (≥ 90 %).
          </p>
        </div>
      ) : null}

      {activeDays.length > 0 ? (
        <Section
          title="Kas vyko per dienas"
          icon={<Calendar className="size-4" />}
          description="Tik dienos, kuriose ceche buvo bent vienas įrašas."
        >
          <div className="grid gap-3 lg:grid-cols-2">
            {activeDays.map((day) => (
              <DayNarrative key={day.date} day={day} />
            ))}
          </div>
        </Section>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        {!stats.filters.machineId ? (
          <Section
            title="Konvejeriai ir staklės"
            icon={<Cog className="size-4" />}
            description="Visos staklės — norma skaičiuojama tik užbaigtoms dienoms su pjovimu."
          >
            <div className="space-y-3">
              {stats.byMachine.map((machine) => (
                <MachineNarrative
                  key={machine.machineId}
                  machine={machine}
                  completedWorkDays={stats.completedWorkDays}
                />
              ))}
            </div>
          </Section>
        ) : null}

        {!stats.filters.workerId && activeWorkers.length > 0 ? (
          <Section
            title="Darbuotojai"
            icon={<Users className="size-4" />}
            description="Darbuotojai, kurie ceche registravo paletes pasirinktame laikotarpyje."
          >
            <div className="space-y-3">
              {activeWorkers.map((worker) => (
                <WorkerNarrative
                  key={worker.userId}
                  worker={worker}
                  hasCompletedDays={stats.completedWorkDays > 0}
                />
              ))}
            </div>
          </Section>
        ) : null}
      </div>

      {stats.totalLogs === 0 ? (
        <Card className="rounded-2xl border-stone-line">
          <CardContent className="py-10 text-center">
            <p className="text-muted-foreground">
              Pasirinktame laikotarpyje nėra ceche paletės įrašų. Pabandykite platesnį
              datų intervalą arba pašalinkite filtrus.
            </p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function FilterField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
      {label}
      {children}
    </label>
  );
}

function MetricCard({
  label,
  value,
  warn = false,
}: {
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <Card className="rounded-2xl border-stone-line">
      <CardContent className="pt-5">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className={`mt-1 text-2xl font-semibold tabular-nums ${warn ? "text-amber-700" : "text-ink"}`}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

function TodayBanner({ good, defect }: { good: number; defect: number }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-sky-200 bg-sky-50 px-5 py-4">
      <Clock className="mt-0.5 size-5 shrink-0 text-sky-700" />
      <div>
        <p className="font-medium text-sky-900">Šiandien gamyba vyksta</p>
        <p className="text-sm text-sky-800/90">
          Kol diena nesibaigė, rodoma tik faktinė produkcija — šiandien jau{" "}
          {formatNumber(good)} vnt.
          {defect > 0 ? `, broko ${formatNumber(defect)} vnt.` : ", be broko"}. Normos
          vertinimas bus galimas rytoj.
        </p>
      </div>
    </div>
  );
}

function StatusBanner({
  ok,
  hasAlerts,
}: {
  ok: boolean;
  hasAlerts: boolean;
}) {
  if (ok && !hasAlerts) return null;

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
      <AlertTriangle className="size-5 shrink-0 text-amber-700" />
      <div>
        <p className="font-medium text-amber-900">
          Užbaigtų dienų tempas žemesnis nei norma
        </p>
        <p className="text-sm text-amber-800/80">
          Rekomenduojama peržiūrėti staklių apkrovą, broko priežastis arba darbuotojų
          rotaciją.
        </p>
      </div>
    </div>
  );
}

function DayNarrative({ day }: { day: ProductionStats["daily"][number] }) {
  if (day.isToday) {
    return (
      <div className="rounded-xl border border-sky-200 bg-sky-50/70 px-4 py-3">
        <p className="font-medium text-ink">
          {formatLtDate(day.date)} · <span className="text-sky-800">šiandien</span>
        </p>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          Kol diena vyksta, fiksuojame tik faktą: jau supjauta{" "}
          <span className="font-medium text-ink">{formatNumber(day.goodPieces)} vnt.</span>
          {day.defectPieces > 0
            ? `, broko ${formatNumber(day.defectPieces)} vnt.`
            : ", be broko"}
          . Ceche {day.logCount} {day.logCount === 1 ? "įrašas" : "įrašai"}.
        </p>
      </div>
    );
  }

  const perf = describeNormPerformance(day.goodPieces, day.expectedPieces);
  return (
    <div
      className={`rounded-xl border px-4 py-3 ${
        day.underNorm ? "border-amber-200 bg-amber-50/60" : "border-stone-line bg-muted/20"
      }`}
    >
      <p className="font-medium text-ink">{formatLtDate(day.date)}</p>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
        Supjauta{" "}
        <span className="font-medium text-ink">{formatNumber(day.goodPieces)} vnt.</span>
        {day.defectPieces > 0
          ? `, broko ${formatNumber(day.defectPieces)} vnt.`
          : ", be broko"}
        . Ceche {day.logCount} {day.logCount === 1 ? "įrašas" : "įrašai"}. Dienos norma —{" "}
        {formatNumber(day.expectedPieces)} vnt. {perf.text}
      </p>
    </div>
  );
}

function MachineNarrative({
  machine,
  completedWorkDays,
}: {
  machine: ProductionStats["byMachine"][number];
  completedWorkDays: number;
}) {
  if (machine.logCount === 0) {
    return (
      <p className="text-sm leading-relaxed text-muted-foreground">
        <span className="font-medium text-ink">
          {machine.shopCode} — {machine.machineName}
        </span>
        : pasirinktame laikotarpyje ceche įrašų nebuvo.
      </p>
    );
  }

  const expected = machine.normPiecesPerDay * completedWorkDays;
  const perf =
    completedWorkDays > 0 && machine.completedGoodPieces > 0
      ? describeNormPerformance(machine.completedGoodPieces, expected)
      : null;

  return (
    <p className="text-sm leading-relaxed text-muted-foreground">
      <span className="font-medium text-ink">
        {machine.shopCode} — {machine.machineName}
      </span>
      : iš viso {formatNumber(machine.goodPieces)} vnt.
      {machine.defectPieces > 0 ? `, broko ${formatNumber(machine.defectPieces)} vnt.` : ""}.
      {completedWorkDays > 0 && machine.completedGoodPieces > 0 ? (
        <>
          {" "}
          Užbaigtose dienose {formatNumber(machine.completedGoodPieces)} vnt., norma (
          {completedWorkDays} d.) — {formatNumber(expected)} vnt.
          {machine.underNorm && perf ? ` ${perf.text}` : ". Atitinka normą."}
        </>
      ) : machine.logCount > 0 ? (
        " Normos vertinimas prasidės, kai bus užbaigta bent viena diena."
      ) : null}
    </p>
  );
}

function WorkerNarrative({
  worker,
  hasCompletedDays,
}: {
  worker: ProductionStats["byWorker"][number];
  hasCompletedDays: boolean;
}) {
  return (
    <div
      className={`rounded-xl border px-4 py-3 ${
        worker.underNorm ? "border-amber-200 bg-amber-50/60" : "border-stone-line bg-muted/20"
      }`}
    >
      <p className="font-medium text-ink">{worker.userName}</p>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
        Užregistravo {formatNumber(worker.goodPieces)} vnt. geros produkcijos
        {worker.defectPieces > 0
          ? ` ir ${formatNumber(worker.defectPieces)} vnt. broko`
          : ", be broko"}
        . {worker.logCount} {worker.logCount === 1 ? "įrašas" : "įrašai"} ceche.
        {hasCompletedDays && worker.completedGoodPieces > 0
          ? worker.underNorm
            ? " Užbaigtų dienų tempas žemiau normos."
            : " Užbaigtų dienų tempas atitinka normą."
          : worker.logCount > 0
            ? " Normos vertinimas prasidės, kai bus užbaigta bent viena diena."
            : null}
      </p>
    </div>
  );
}

function AlertExplanation({
  alert,
}: {
  alert: ProductionStats["underNormAlerts"][number];
}) {
  const typeLabel =
    alert.type === "machine"
      ? "Staklė"
      : alert.type === "worker"
        ? "Darbuotojas"
        : alert.type === "hour"
          ? "Valanda"
          : "Diena";

  const when =
    alert.type === "hour"
      ? formatLtHour(alert.label.slice(0, 10), Number(alert.label.slice(11, 13)))
      : alert.type === "day"
        ? formatLtDate(alert.label)
        : alert.label;

  return (
    <span>
      <strong>{typeLabel}</strong> ({when}): supjauta {formatNumber(alert.goodPieces)} vnt.,
      tikėtasi apie {formatNumber(alert.expectedPieces)} vnt. —{" "}
      <strong>{alert.percent} %</strong> normos.
    </span>
  );
}

function Section({
  title,
  icon,
  description,
  children,
  className,
}: {
  title: string;
  icon: React.ReactNode;
  description: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={`rounded-2xl border-stone-line ${className ?? ""}`}>
      <CardHeader className="border-b border-stone-line pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          {icon}
          {title}
        </CardTitle>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent className="pt-4">{children}</CardContent>
    </Card>
  );
}
