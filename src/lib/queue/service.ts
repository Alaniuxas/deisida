import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  jobs,
  tiles,
  proposals,
  machines,
  machineAssignments,
  users,
  palletLogs,
  alerts,
  type JobRow,
} from "@/lib/db/schema";
import { scheduleQueue } from "@/lib/queue/schedule";
import type { Machine as PlannerMachine, QueueJob as PlannerJob } from "@/lib/queue/types";
import { DEFAULT_CHANGEOVER_MINUTES } from "@/lib/queue/constants";
import type {
  QueueResponse,
  QueueWidthGroup,
  NextJobResponse,
  ShopJob,
  ConveyorInfo,
  AssignmentsResponse,
  Person,
  Machine as AdminMachine,
} from "@/lib/production-types";
import type { PackagingOptions } from "@/lib/types";
import { defaultPackaging } from "@/lib/types";

export interface QueuedJob extends JobRow {
  tileName: string;
  proposalNumber: string;
  clientName: string;
  object: string;
  pjovimas: string;
  packaging: PackagingOptions;
  tileHeightMm: number;
}

function parsePackaging(json: string): PackagingOptions {
  try {
    return { ...defaultPackaging(), ...JSON.parse(json) };
  } catch {
    return defaultPackaging();
  }
}

async function loadQueuedJobs(): Promise<QueuedJob[]> {
  const statuses = ["queued", "in_progress"] as const;
  const rows = await db
    .select({
      job: jobs,
      tileName: tiles.name,
      tileHeightMm: tiles.heightMm,
      proposalNumber: proposals.number,
      clientName: proposals.clientName,
      object: proposals.object,
      pjovimas: proposals.pjovimas,
      packagingJson: proposals.packagingJson,
    })
    .from(jobs)
    .innerJoin(tiles, eq(jobs.tileId, tiles.id))
    .innerJoin(proposals, eq(jobs.proposalId, proposals.id))
    .where(inArray(jobs.status, [...statuses]))
    .orderBy(asc(jobs.deadline), asc(jobs.sortOrder));

  return rows.map((row) => ({
    ...row.job,
    tileName: row.tileName,
    proposalNumber: row.proposalNumber,
    clientName: row.clientName,
    object: row.object,
    pjovimas: row.pjovimas,
    packaging: parsePackaging(row.packagingJson),
    tileHeightMm: row.tileHeightMm,
  }));
}

function toPlannerMachines(
  machineRows: (typeof machines.$inferSelect)[],
): PlannerMachine[] {
  return machineRows.map((machine) => ({
    id: machine.id,
    currentWidthMm: machine.currentWidthMm ?? 0,
    dailyRatePieces: machine.dailyRate,
    changeoverMinutes: DEFAULT_CHANGEOVER_MINUTES,
  }));
}

function toPlannerJobs(jobRows: QueuedJob[]): PlannerJob[] {
  return jobRows.map((job) => ({
    id: job.id,
    tileWidthMm: job.widthMm,
    quantityPieces: job.pieceCount,
    deadline: job.deadline,
    cutType: job.pjovimas,
    proposalId: job.proposalId,
  }));
}

export async function getScheduledQueue(): Promise<QueueResponse> {
  const [jobRows, machineRows] = await Promise.all([
    loadQueuedJobs(),
    db.select().from(machines).orderBy(asc(machines.code)),
  ]);

  if (jobRows.length === 0) {
    return { groups: [] };
  }

  const assignments = scheduleQueue(
    toPlannerMachines(machineRows),
    toPlannerJobs(jobRows),
  );

  const assignmentMap = new Map(
    assignments.map((assignment) => [assignment.jobId, assignment]),
  );

  const grouped = new Map<number, QueueWidthGroup>();

  for (const job of jobRows) {
    const assignment = assignmentMap.get(job.id);
    const widthMm = job.widthMm;
    const group = grouped.get(widthMm) ?? { widthMm, jobs: [] };

    group.jobs.push({
      id: job.id,
      tileName: job.tileName,
      client: job.clientName,
      object: job.object,
      deadline: job.deadline,
      storisMm: job.tileHeightMm,
      quantityPlanned: job.quantity,
      quantityUnit: job.quantityUnit as "pieces" | "pallets",
      conveyorCode: assignment?.machineId as "KONV" | "KNEW" | undefined,
    });

    grouped.set(widthMm, group);
  }

  const groups = [...grouped.values()].sort((a, b) => a.widthMm - b.widthMm);
  for (const group of groups) {
    group.jobs.sort((left, right) => {
      const leftAssignment = assignmentMap.get(left.id);
      const rightAssignment = assignmentMap.get(right.id);
      if (leftAssignment && rightAssignment) {
        return (
          leftAssignment.estimatedStart.getTime() -
          rightAssignment.estimatedStart.getTime()
        );
      }
      return new Date(left.deadline).getTime() - new Date(right.deadline).getTime();
    });
  }

  return { groups };
}

async function countLoggedQuantity(jobId: string): Promise<number> {
  const logs = await db
    .select()
    .from(palletLogs)
    .where(eq(palletLogs.jobId, jobId));
  return logs.reduce((sum, log) => sum + log.quantity, 0);
}

function toShopJob(job: QueuedJob, quantityLogged: number): ShopJob {
  const quantityPlanned =
    job.quantityUnit === "pallets" ? job.quantity : job.pieceCount;
  const remaining = Math.max(0, quantityPlanned - quantityLogged);

  return {
    id: job.id,
    tileName: job.tileName,
    storisMm: job.tileHeightMm,
    quantityPlanned,
    quantityLogged,
    quantityUnit: job.quantityUnit as "pieces" | "pallets",
    remaining,
    packaging: job.packaging,
    client: job.clientName,
    object: job.object,
  };
}

export async function getNextJobForUser(userId: string): Promise<NextJobResponse> {
  const [assignment] = await db
    .select({
      machine: machines,
    })
    .from(machineAssignments)
    .innerJoin(machines, eq(machineAssignments.machineId, machines.id))
    .where(eq(machineAssignments.userId, userId))
    .limit(1);

  if (!assignment) {
    return { conveyor: null, job: null };
  }

  const conveyor: ConveyorInfo = {
    id: assignment.machine.id,
    code: assignment.machine.code as "KONV" | "KNEW",
    name: assignment.machine.title,
  };

  const queue = await getScheduledQueue();
  const machineJobs =
    queue.groups
      .flatMap((group) => group.jobs)
      .filter((job) => job.conveyorCode === conveyor.code) ?? [];

  const nextJobId = machineJobs[0]?.id;
  if (!nextJobId) {
    return { conveyor, job: null };
  }

  const allJobs = await loadQueuedJobs();
  const job = allJobs.find((item) => item.id === nextJobId);
  if (!job) {
    return { conveyor, job: null };
  }

  const quantityLogged = await countLoggedQuantity(job.id);
  return { conveyor, job: toShopJob(job, quantityLogged) };
}

export async function logJobPallet(
  jobId: string,
  userId: string,
): Promise<ShopJob> {
  const allJobs = await loadQueuedJobs();
  const job = allJobs.find((item) => item.id === jobId);
  if (!job) throw new Error("Darbas nerastas.");

  await db.insert(palletLogs).values({
    id: crypto.randomUUID(),
    jobId,
    quantity: 1,
    damaged: false,
    loggedAt: new Date().toISOString(),
    loggedById: userId,
  });

  if (job.status === "queued") {
    await db
      .update(jobs)
      .set({ status: "in_progress", startedAt: new Date().toISOString() })
      .where(eq(jobs.id, jobId));
  }

  const quantityLogged = await countLoggedQuantity(jobId);
  return toShopJob(job, quantityLogged);
}

export async function finishJob(
  jobId: string,
  userId: string,
  reason?: string,
): Promise<{ completionPercent: number; managerSignalSaved: boolean }> {
  const allJobs = await loadQueuedJobs();
  const job = allJobs.find((item) => item.id === jobId);
  if (!job) throw new Error("Darbas nerastas.");

  const quantityLogged = await countLoggedQuantity(jobId);
  const quantityPlanned =
    job.quantityUnit === "pallets" ? job.quantity : job.pieceCount;
  const completionPercent =
    quantityPlanned > 0
      ? Math.round((quantityLogged / quantityPlanned) * 100)
      : 0;

  const managerSignalSaved = completionPercent < 90;

  if (managerSignalSaved) {
    await db.insert(alerts).values({
      id: crypto.randomUUID(),
      jobId,
      type: "under_90_percent",
      message:
        reason?.trim() ||
        `Darbas ${job.proposalNumber} užbaigtas su ${completionPercent} % plano.`,
      createdAt: new Date().toISOString(),
      acknowledged: false,
    });
  }

  await db
    .update(jobs)
    .set({
      status: "completed",
      completedPieces: quantityLogged,
      finishedAt: new Date().toISOString(),
    })
    .where(eq(jobs.id, jobId));

  return { completionPercent, managerSignalSaved };
}

export async function getAssignments(): Promise<AssignmentsResponse> {
  const [peopleRows, machineRows, assignmentRows] = await Promise.all([
    db
      .select()
      .from(users)
      .where(eq(users.role, "cechas"))
      .orderBy(asc(users.name)),
    db.select().from(machines).orderBy(asc(machines.code)),
    db.select().from(machineAssignments),
  ]);

  const people: Person[] = peopleRows.map((person) => ({
    id: person.id,
    name: person.name,
  }));

  const assignedByMachine = new Map<string, string[]>();
  for (const assignment of assignmentRows) {
    const current = assignedByMachine.get(assignment.machineId) ?? [];
    current.push(assignment.userId);
    assignedByMachine.set(assignment.machineId, current);
  }

  const adminMachines: AdminMachine[] = machineRows.map((machine) => ({
    id: machine.id,
    code: machine.code as "KONV" | "KNEW",
    name: machine.title,
    dailyRatePallets: machine.dailyRate,
    rotationHours: machine.rotationHours ?? 4,
    currentWidthMm: machine.currentWidthMm ?? 0,
    assignedPersonIds: assignedByMachine.get(machine.id) ?? [],
  }));

  return { people, machines: adminMachines };
}

export async function saveAssignments(
  assignments: { personId: string; machineId: string }[],
): Promise<AssignmentsResponse> {
  await db.delete(machineAssignments);

  for (const assignment of assignments) {
    await db.insert(machineAssignments).values({
      userId: assignment.personId,
      machineId: assignment.machineId,
    });
  }

  return getAssignments();
}

export async function patchMachineSettings(
  machineId: string,
  patch: {
    dailyRatePallets?: number;
    rotationHours?: number;
    currentWidthMm?: number;
  },
): Promise<AssignmentsResponse> {
  const [machine] = await db
    .select()
    .from(machines)
    .where(eq(machines.id, machineId))
    .limit(1);

  if (!machine) throw new Error("Konvejeris nerastas.");

  await db
    .update(machines)
    .set({
      dailyRate:
        patch.dailyRatePallets !== undefined
          ? patch.dailyRatePallets
          : machine.dailyRate,
      rotationHours:
        patch.rotationHours !== undefined
          ? patch.rotationHours
          : machine.rotationHours,
      currentWidthMm:
        patch.currentWidthMm !== undefined
          ? patch.currentWidthMm
          : machine.currentWidthMm,
    })
    .where(eq(machines.id, machineId));

  return getAssignments();
}
