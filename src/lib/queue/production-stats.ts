import { and, asc, eq, gte, lte } from "drizzle-orm";
import { addDays } from "date-fns";
import { db } from "@/lib/db";
import { jobs, machines, palletLogs, users } from "@/lib/db/schema";
import { SHIFT_HOURS } from "@/lib/queue/constants";
import { formatDateIso, parseDateIso, todayIso } from "@/lib/queue/rotation-dates";

export interface StatsFilters {
  dateFrom: string;
  dateTo: string;
  machineId?: string;
  workerId?: string;
}

export interface FilterOption {
  id: string;
  label: string;
}

export interface DailyStat {
  date: string;
  goodPieces: number;
  defectPieces: number;
  logCount: number;
  expectedPieces: number;
  underNorm: boolean;
  isToday: boolean;
}

export interface HourlyStat {
  date: string;
  hour: number;
  goodPieces: number;
  defectPieces: number;
  logCount: number;
}

export interface MachineStat {
  machineId: string;
  machineCode: string;
  shopCode: string;
  machineName: string;
  goodPieces: number;
  completedGoodPieces: number;
  defectPieces: number;
  logCount: number;
  normPiecesPerDay: number;
  underNorm: boolean;
}

export interface WorkerStat {
  userId: string;
  userName: string;
  goodPieces: number;
  completedGoodPieces: number;
  defectPieces: number;
  logCount: number;
  underNorm: boolean;
}

export interface ProductionStats {
  dateFrom: string;
  dateTo: string;
  todayIso: string;
  completedWorkDays: number;
  completedGood: number;
  completedDefect: number;
  todayGood: number;
  todayDefect: number;
  filters: {
    machineId: string | null;
    workerId: string | null;
  };
  availableFilters: {
    machines: FilterOption[];
    workers: FilterOption[];
  };
  totalGood: number;
  totalDefect: number;
  totalLogs: number;
  daily: DailyStat[];
  hourly: HourlyStat[];
  byMachine: MachineStat[];
  byWorker: WorkerStat[];
  underNormAlerts: {
    type: "day" | "machine" | "worker" | "hour";
    label: string;
    goodPieces: number;
    expectedPieces: number;
    percent: number;
  }[];
}

interface RawLogRow {
  loggedAt: string;
  goodQuantity: number;
  defectQuantity: number;
  loggedById: string | null;
  loggedByName: string | null;
  machineId: string | null;
  machineCode: string | null;
  shopCode: string | null;
  machineName: string | null;
  normPiecesPerDay: number | null;
}

function dateKey(iso: string): string {
  return iso.slice(0, 10);
}

function hourKey(iso: string): number {
  const date = new Date(iso);
  return date.getHours();
}

function workingDaysBetween(from: string, to: string): number {
  const start = new Date(from);
  const end = new Date(to);
  let count = 0;
  const cursor = new Date(start);
  while (cursor <= end) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) count += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return Math.max(1, count);
}

function eachDateInRange(from: string, to: string): string[] {
  const dates: string[] = [];
  let cursor = parseDateIso(from);
  const end = parseDateIso(to);
  while (cursor <= end) {
    dates.push(formatDateIso(cursor));
    cursor = addDays(cursor, 1);
  }
  return dates;
}

function normEvaluationEndDate(dateTo: string, today: string): string | null {
  if (dateTo < today) return dateTo;
  const yesterday = formatDateIso(addDays(parseDateIso(today), -1));
  if (yesterday < dateTo) return yesterday;
  return null;
}

export async function getProductionStats(
  filters: StatsFilters,
): Promise<ProductionStats> {
  const rows = await db
    .select({
      loggedAt: palletLogs.loggedAt,
      goodQuantity: palletLogs.goodQuantity,
      defectQuantity: palletLogs.defectQuantity,
      loggedById: palletLogs.loggedById,
      loggedByName: users.name,
      machineId: jobs.machineId,
      machineCode: machines.code,
      shopCode: machines.shopCode,
      machineName: machines.title,
      normPiecesPerDay: machines.piecesPerDay,
    })
    .from(palletLogs)
    .innerJoin(jobs, eq(palletLogs.jobId, jobs.id))
    .leftJoin(machines, eq(jobs.machineId, machines.id))
    .leftJoin(users, eq(palletLogs.loggedById, users.id))
    .where(
      and(
        gte(palletLogs.loggedAt, filters.dateFrom),
        lte(palletLogs.loggedAt, `${filters.dateTo}T23:59:59.999Z`),
      ),
    ) as RawLogRow[];

  const [allMachineRows, allWorkerRows] = await Promise.all([
    db.select().from(machines).orderBy(asc(machines.shopCode), asc(machines.code)),
    db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(eq(users.role, "cechas"))
      .orderBy(asc(users.name)),
  ]);

  const availableFilters = {
    machines: allMachineRows.map((machine) => ({
      id: machine.id,
      label: `${machine.shopCode ?? machine.code} — ${machine.title}`,
    })),
    workers: allWorkerRows.map((worker) => ({
      id: worker.id,
      label: worker.name,
    })),
  };

  const filteredRows = rows.filter((row) => {
    if (filters.machineId && row.machineId !== filters.machineId) return false;
    if (filters.workerId && row.loggedById !== filters.workerId) return false;
    return true;
  });

  const today = todayIso();
  const normEndDate = normEvaluationEndDate(filters.dateTo, today);
  const completedWorkDays =
    normEndDate && normEndDate >= filters.dateFrom
      ? workingDaysBetween(filters.dateFrom, normEndDate)
      : 0;

  const dailyMap = new Map<string, DailyStat>();
  const hourlyMap = new Map<string, HourlyStat>();
  const machineMap = new Map<string, MachineStat>();
  const workerMap = new Map<string, WorkerStat>();

  let totalGood = 0;
  let totalDefect = 0;
  let todayGood = 0;
  let todayDefect = 0;
  let completedGood = 0;
  let completedDefect = 0;
  const machineCompletedGood = new Map<string, number>();
  const workerCompletedGood = new Map<string, number>();

  for (const row of filteredRows) {
    const good = row.goodQuantity > 0 ? row.goodQuantity : 0;
    const defect = row.defectQuantity;
    const day = dateKey(row.loggedAt);
    const isToday = day === today;

    totalGood += good;
    totalDefect += defect;
    if (isToday) {
      todayGood += good;
      todayDefect += defect;
    } else {
      completedGood += good;
      completedDefect += defect;
    }
    const hour = hourKey(row.loggedAt);
    const hourComposite = `${day}-${hour}`;

    const daily = dailyMap.get(day) ?? {
      date: day,
      goodPieces: 0,
      defectPieces: 0,
      logCount: 0,
      expectedPieces: 0,
      underNorm: false,
    };
    daily.goodPieces += good;
    daily.defectPieces += defect;
    daily.logCount += 1;
    dailyMap.set(day, daily);

    const hourly = hourlyMap.get(hourComposite) ?? {
      date: day,
      hour,
      goodPieces: 0,
      defectPieces: 0,
      logCount: 0,
    };
    hourly.goodPieces += good;
    hourly.defectPieces += defect;
    hourly.logCount += 1;
    hourlyMap.set(hourComposite, hourly);

    if (row.machineId && row.machineCode) {
      const machineKey = row.machineId;
      const machine = machineMap.get(machineKey) ?? {
        machineId: row.machineId,
        machineCode: row.machineCode,
        shopCode: row.shopCode ?? row.machineCode,
        machineName: row.machineName ?? row.machineCode,
        goodPieces: 0,
        completedGoodPieces: 0,
        defectPieces: 0,
        logCount: 0,
        normPiecesPerDay: row.normPiecesPerDay ?? 0,
        underNorm: false,
      };
      machine.goodPieces += good;
      machine.defectPieces += defect;
      machine.logCount += 1;
      if (!isToday) machine.completedGoodPieces += good;
      machineMap.set(machineKey, machine);
      if (!isToday) {
        machineCompletedGood.set(
          machineKey,
          (machineCompletedGood.get(machineKey) ?? 0) + good,
        );
      }
    }

    if (row.loggedById) {
      const worker = workerMap.get(row.loggedById) ?? {
        userId: row.loggedById,
        userName: row.loggedByName ?? "Nežinomas",
        goodPieces: 0,
        completedGoodPieces: 0,
        defectPieces: 0,
        logCount: 0,
        underNorm: false,
      };
      worker.goodPieces += good;
      worker.defectPieces += defect;
      worker.logCount += 1;
      if (!isToday) worker.completedGoodPieces += good;
      workerMap.set(row.loggedById, worker);
      if (!isToday) {
        workerCompletedGood.set(
          row.loggedById,
          (workerCompletedGood.get(row.loggedById) ?? 0) + good,
        );
      }
    }
  }

  const allMachines = allMachineRows;

  const byMachine = allMachineRows
    .map((machine) => {
      const stat = machineMap.get(machine.id);
      const normPiecesPerDay = machine.piecesPerDay ?? 0;
      if (stat) {
        const expected = stat.normPiecesPerDay * completedWorkDays;
        const goodForNorm = machineCompletedGood.get(machine.id) ?? 0;
        return {
          ...stat,
          underNorm:
            completedWorkDays > 0 &&
            goodForNorm > 0 &&
            expected > 0 &&
            goodForNorm < expected * 0.9,
        };
      }
      return {
        machineId: machine.id,
        machineCode: machine.code,
        shopCode: machine.shopCode ?? machine.code,
        machineName: machine.title,
        goodPieces: 0,
        completedGoodPieces: 0,
        defectPieces: 0,
        logCount: 0,
        normPiecesPerDay,
        underNorm: false,
      };
    })
    .sort((a, b) => b.goodPieces - a.goodPieces);

  let expectedPerDay: number;
  if (filters.machineId) {
    const selected = allMachines.find((m) => m.id === filters.machineId);
    expectedPerDay = selected?.piecesPerDay ?? 0;
  } else {
    expectedPerDay = allMachines.reduce((sum, m) => sum + (m.piecesPerDay ?? 0), 0);
  }

  const daily = eachDateInRange(filters.dateFrom, filters.dateTo).map((date) => {
    const existing = dailyMap.get(date);
    const isToday = date === today;
    const goodPieces = existing?.goodPieces ?? 0;
    const defectPieces = existing?.defectPieces ?? 0;
    const logCount = existing?.logCount ?? 0;
    const expected = expectedPerDay;
    return {
      date,
      goodPieces,
      defectPieces,
      logCount,
      expectedPieces: expected,
      isToday,
      underNorm:
        !isToday &&
        logCount > 0 &&
        expected > 0 &&
        goodPieces < expected * 0.9,
    };
  });

  const hourly = [...hourlyMap.values()].sort((a, b) => {
    const cmp = a.date.localeCompare(b.date);
    return cmp !== 0 ? cmp : a.hour - b.hour;
  });

  const hourlyNorm = expectedPerDay / SHIFT_HOURS;

  const avgWorkerNorm = byMachine.length > 0
    ? byMachine.reduce((s, m) => s + m.normPiecesPerDay, 0) / byMachine.length
    : 0;
  const expectedPerWorker = avgWorkerNorm * completedWorkDays;

  const byWorker = [...workerMap.values()]
    .map((w) => {
      const goodForNorm = workerCompletedGood.get(w.userId) ?? 0;
      return {
        ...w,
        underNorm:
          completedWorkDays > 0 &&
          goodForNorm > 0 &&
          expectedPerWorker > 0 &&
          goodForNorm < expectedPerWorker * 0.9,
      };
    })
    .sort((a, b) => b.goodPieces - a.goodPieces);

  const underNormAlerts: ProductionStats["underNormAlerts"] = [];

  for (const d of daily) {
    if (d.underNorm) {
      underNormAlerts.push({
        type: "day",
        label: d.date,
        goodPieces: d.goodPieces,
        expectedPieces: d.expectedPieces,
        percent: d.expectedPieces > 0
          ? Math.round((d.goodPieces / d.expectedPieces) * 100)
          : 0,
      });
    }
  }

  for (const m of byMachine) {
    if (m.underNorm) {
      const expected = m.normPiecesPerDay * completedWorkDays;
      const goodForNorm = machineCompletedGood.get(m.machineId) ?? 0;
      underNormAlerts.push({
        type: "machine",
        label: `${m.shopCode} (${m.machineName})`,
        goodPieces: goodForNorm,
        expectedPieces: expected,
        percent: expected > 0 ? Math.round((goodForNorm / expected) * 100) : 0,
      });
    }
  }

  for (const w of byWorker) {
    if (w.underNorm) {
      const goodForNorm = workerCompletedGood.get(w.userId) ?? 0;
      underNormAlerts.push({
        type: "worker",
        label: w.userName,
        goodPieces: goodForNorm,
        expectedPieces: Math.round(expectedPerWorker),
        percent: expectedPerWorker > 0
          ? Math.round((goodForNorm / expectedPerWorker) * 100)
          : 0,
      });
    }
  }

  for (const h of hourly) {
    if (
      h.date !== today &&
      hourlyNorm > 0 &&
      h.goodPieces < hourlyNorm * 0.9 &&
      h.logCount > 0
    ) {
      underNormAlerts.push({
        type: "hour",
        label: `${h.date} ${String(h.hour).padStart(2, "0")}:00`,
        goodPieces: h.goodPieces,
        expectedPieces: Math.round(hourlyNorm),
        percent: Math.round((h.goodPieces / hourlyNorm) * 100),
      });
    }
  }

  return {
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    todayIso: today,
    completedWorkDays,
    completedGood,
    completedDefect,
    todayGood,
    todayDefect,
    filters: {
      machineId: filters.machineId ?? null,
      workerId: filters.workerId ?? null,
    },
    availableFilters,
    totalGood,
    totalDefect,
    totalLogs: filteredRows.length,
    daily,
    hourly,
    byMachine,
    byWorker,
    underNormAlerts,
  };
}
