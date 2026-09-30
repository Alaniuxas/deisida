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
import {
  DEFAULT_CHANGEOVER_MINUTES,
  DEFAULT_ROTATION_HOURS,
} from "@/lib/queue/constants";
import type {
  QueueResponse,
  QueueWidthGroup,
  QueueLane,
  NextJobResponse,
  ShopJob,
  ConveyorInfo,
  AssignmentsResponse,
  Person,
  Machine as AdminMachine,
  JobScheduleInfo,
  QueueJob as ApiQueueJob,
  MachineCode,
} from "@/lib/production-types";
import type { PackagingOptions } from "@/lib/types";
import { defaultPackaging } from "@/lib/types";

export interface QueuedJob extends JobRow {
  tileName: string;
  tileQuantityPerPallet: number;
  proposalNumber: string;
  clientName: string;
  object: string;
  address: string;
  pjovimas: string;
  packaging: PackagingOptions;
  tileHeightMm: number;
}

interface BuiltSchedule {
  assignments: ReturnType<typeof scheduleQueue>;
  machineRows: (typeof machines.$inferSelect)[];
  machineCodeById: Map<string, MachineCode>;
  machineById: Map<string, typeof machines.$inferSelect>;
  assignmentMap: Map<string, ReturnType<typeof scheduleQueue>[number]>;
  jobRows: QueuedJob[];
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
      tileQuantityPerPallet: tiles.quantityPerPallet,
      tileHeightMm: tiles.heightMm,
      proposalNumber: proposals.number,
      clientName: proposals.clientName,
      object: proposals.object,
      address: proposals.address,
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
    tileQuantityPerPallet: row.tileQuantityPerPallet,
    proposalNumber: row.proposalNumber,
    clientName: row.clientName,
    object: row.object,
    address: row.address,
    pjovimas: row.pjovimas,
    packaging: parsePackaging(row.packagingJson),
    tileHeightMm: row.tileHeightMm,
  }));
}

function toPalletCount(job: QueuedJob): number {
  if (job.quantityUnit === "pallets") {
    return job.quantity;
  }
  if (job.tileQuantityPerPallet > 0) {
    return job.quantity / job.tileQuantityPerPallet;
  }
  return job.pieceCount;
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
    quantityPallets: toPalletCount(job),
    deadline: job.deadline,
    cutType: job.pjovimas,
    proposalId: job.proposalId,
  }));
}

function deriveMachineWidthMm(
  machine: (typeof machines.$inferSelect),
  machineJobs: QueuedJob[],
): number {
  if (machine.currentWidthMm && machine.currentWidthMm > 0) {
    return machine.currentWidthMm;
  }

  const inProgress = machineJobs.find((job) => job.status === "in_progress");
  if (inProgress) {
    return inProgress.widthMm;
  }

  return 0;
}

function buildAssignmentReason(
  job: QueuedJob,
  machine: (typeof machines.$inferSelect),
  machineCurrentWidthMm: number,
  requiresChangeover: boolean,
  splitProposalWidths: Set<string>,
): string {
  const proposalKey = job.proposalId;
  const widthMatches =
    machineCurrentWidthMm > 0 && job.widthMm === machineCurrentWidthMm;

  if (splitProposalWidths.has(proposalKey)) {
    return `Užsakyme keli plytų plotiai — priskirta ${machine.code}, kad nereikėtų reguliuoti konvejerio.`;
  }

  if (widthMatches) {
    return `Konvejeris ${machine.code} jau sureguliuotas ${job.widthMm} mm pločiui — prioritetas pagal plotį, tada terminą.`;
  }

  if (requiresChangeover && machineCurrentWidthMm > 0) {
    return `Po šio darbo reikės reguliuoti konvejerį iš ${machineCurrentWidthMm} mm į ${job.widthMm} mm (+${DEFAULT_CHANGEOVER_MINUTES} min.).`;
  }

  if (machineCurrentWidthMm === 0) {
    return `Konvejeris ${machine.code} dar nereguliuotas — darbas planuojamas pagal ${job.widthMm} mm plotį ir terminą.`;
  }

  return `Priskirta ${machine.code} pagal eilės tvarką (plotis ${job.widthMm} mm, terminas).`;
}

async function buildSchedule(): Promise<BuiltSchedule | null> {
  const [jobRows, machineRows] = await Promise.all([
    loadQueuedJobs(),
    db.select().from(machines).orderBy(asc(machines.code)),
  ]);

  if (jobRows.length === 0) {
    return null;
  }

  const machineCodeById = new Map(
    machineRows.map((machine) => [machine.id, machine.code as MachineCode]),
  );
  const machineById = new Map(machineRows.map((machine) => [machine.id, machine]));

  const assignments = scheduleQueue(
    toPlannerMachines(machineRows),
    toPlannerJobs(jobRows),
  );

  const assignmentMap = new Map(
    assignments.map((assignment) => [assignment.jobId, assignment]),
  );

  return {
    assignments,
    machineRows,
    machineCodeById,
    machineById,
    assignmentMap,
    jobRows,
  };
}

function toJobScheduleInfo(
  job: QueuedJob,
  assignment: ReturnType<typeof scheduleQueue>[number],
  machine: (typeof machines.$inferSelect),
  positionInQueue: number,
  assignmentReason: string,
): JobScheduleInfo {
  const productionHours = assignment.durationHours - assignment.changeoverHours;

  return {
    widthMm: job.widthMm,
    deadline: job.deadline,
    conveyorCode: machine.code as MachineCode,
    conveyorName: machine.title,
    machineCurrentWidthMm: machine.currentWidthMm ?? 0,
    dailyRatePallets: machine.dailyRate,
    rotationHours: machine.rotationHours ?? DEFAULT_ROTATION_HOURS,
    changeoverMinutes: DEFAULT_CHANGEOVER_MINUTES,
    quantityPallets: toPalletCount(job),
    productionHours,
    changeoverHours: assignment.changeoverHours,
    durationHours: assignment.durationHours,
    estimatedStart: assignment.estimatedStart.toISOString(),
    estimatedEnd: assignment.estimatedEnd.toISOString(),
    positionInQueue,
    requiresChangeover: assignment.changeoverHours > 0,
    assignmentReason,
  };
}

function toApiQueueJob(
  job: QueuedJob,
  schedule?: JobScheduleInfo,
): ApiQueueJob {
  return {
    id: job.id,
    tileName: job.tileName,
    proposalNumber: job.proposalNumber,
    client: job.clientName,
    object: job.object,
    deadline: job.deadline,
    storisMm: job.tileHeightMm,
    widthMm: job.widthMm,
    quantityPlanned: job.quantity,
    quantityUnit: job.quantityUnit as "pieces" | "pallets",
    conveyorCode: schedule?.conveyorCode,
    schedule,
  };
}

function detectSplitProposalWidths(jobRows: QueuedJob[]): Set<string> {
  const widthsByProposal = new Map<string, Set<number>>();

  for (const job of jobRows) {
    const widths = widthsByProposal.get(job.proposalId) ?? new Set<number>();
    widths.add(job.widthMm);
    widthsByProposal.set(job.proposalId, widths);
  }

  const split = new Set<string>();
  for (const [proposalId, widths] of widthsByProposal) {
    if (widths.size > 1) {
      split.add(proposalId);
    }
  }

  return split;
}

function sortJobsForLane(
  laneJobs: { job: QueuedJob; assignment: ReturnType<typeof scheduleQueue>[number] }[],
  machineCurrentWidthMm: number,
): { job: QueuedJob; assignment: ReturnType<typeof scheduleQueue>[number] }[] {
  return [...laneJobs].sort((left, right) => {
    const leftInProgress = left.job.status === "in_progress" ? 0 : 1;
    const rightInProgress = right.job.status === "in_progress" ? 0 : 1;
    if (leftInProgress !== rightInProgress) {
      return leftInProgress - rightInProgress;
    }

    const leftWidthMatch =
      left.job.widthMm === machineCurrentWidthMm && machineCurrentWidthMm > 0
        ? 0
        : 1;
    const rightWidthMatch =
      right.job.widthMm === machineCurrentWidthMm && machineCurrentWidthMm > 0
        ? 0
        : 1;
    if (leftWidthMatch !== rightWidthMatch) {
      return leftWidthMatch - rightWidthMatch;
    }

    if (left.job.widthMm !== right.job.widthMm) {
      return left.job.widthMm - right.job.widthMm;
    }

    return (
      new Date(left.job.deadline).getTime() -
      new Date(right.job.deadline).getTime()
    );
  });
}

export async function getScheduledQueue(): Promise<QueueResponse> {
  const built = await buildSchedule();
  if (!built) {
    return { lanes: [], groups: [] };
  }

  const splitProposalWidths = detectSplitProposalWidths(built.jobRows);
  const lanes: QueueLane[] = [];
  const grouped = new Map<number, QueueWidthGroup>();

  for (const machine of built.machineRows) {
    const machineJobs = built.jobRows
      .map((job) => {
        const assignment = built.assignmentMap.get(job.id);
        if (!assignment || assignment.machineId !== machine.id) {
          return null;
        }
        return { job, assignment };
      })
      .filter(
        (
          item,
        ): item is {
          job: QueuedJob;
          assignment: ReturnType<typeof scheduleQueue>[number];
        } => item !== null,
      );

    const machineCurrentWidthMm = deriveMachineWidthMm(machine, machineJobs.map((item) => item.job));
    const ordered = sortJobsForLane(machineJobs, machineCurrentWidthMm);

    const laneJobs: ApiQueueJob[] = ordered.map(({ job, assignment }, index) => {
      const requiresChangeover = assignment.changeoverHours > 0;
      const assignmentReason = buildAssignmentReason(
        job,
        machine,
        machineCurrentWidthMm,
        requiresChangeover,
        splitProposalWidths,
      );
      const schedule = toJobScheduleInfo(
        job,
        assignment,
        machine,
        index + 1,
        assignmentReason,
      );
      const apiJob = toApiQueueJob(job, schedule);

      const widthGroup = grouped.get(job.widthMm) ?? { widthMm: job.widthMm, jobs: [] };
      widthGroup.jobs.push(apiJob);
      grouped.set(job.widthMm, widthGroup);

      return apiJob;
    });

    lanes.push({
      code: machine.code as MachineCode,
      name: machine.title,
      currentWidthMm: machineCurrentWidthMm,
      dailyRatePallets: machine.dailyRate,
      rotationHours: machine.rotationHours ?? DEFAULT_ROTATION_HOURS,
      changeoverMinutes: DEFAULT_CHANGEOVER_MINUTES,
      jobs: laneJobs,
    });
  }

  const groups = [...grouped.values()].sort((a, b) => a.widthMm - b.widthMm);
  for (const group of groups) {
    group.jobs.sort((left, right) => {
      if (left.schedule && right.schedule) {
        const leftStart = new Date(left.schedule.estimatedStart).getTime();
        const rightStart = new Date(right.schedule.estimatedStart).getTime();
        if (leftStart !== rightStart) return leftStart - rightStart;
      }
      if (left.widthMm !== right.widthMm) return left.widthMm - right.widthMm;
      return new Date(left.deadline).getTime() - new Date(right.deadline).getTime();
    });
  }

  return { lanes, groups };
}

async function countLoggedQuantity(jobId: string): Promise<number> {
  const logs = await db
    .select()
    .from(palletLogs)
    .where(eq(palletLogs.jobId, jobId));
  return logs.reduce((sum, log) => sum + log.quantity, 0);
}

function toShopJob(
  job: QueuedJob,
  quantityLogged: number,
  schedule?: JobScheduleInfo,
): ShopJob {
  const quantityPlanned =
    job.quantityUnit === "pallets" ? job.quantity : job.pieceCount;
  const remaining = Math.max(0, quantityPlanned - quantityLogged);

  return {
    id: job.id,
    tileName: job.tileName,
    proposalNumber: job.proposalNumber,
    storisMm: job.tileHeightMm,
    quantityPlanned,
    quantityLogged,
    quantityUnit: job.quantityUnit as "pieces" | "pallets",
    remaining,
    packaging: job.packaging,
    client: job.clientName,
    object: job.object,
    address: job.address,
    pjovimas: job.pjovimas,
    schedule,
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

  const machine = assignment.machine;
  const conveyor: ConveyorInfo = {
    id: machine.id,
    code: machine.code as MachineCode,
    name: machine.title,
    currentWidthMm: machine.currentWidthMm ?? 0,
    dailyRatePallets: machine.dailyRate,
    rotationHours: machine.rotationHours ?? DEFAULT_ROTATION_HOURS,
    changeoverMinutes: DEFAULT_CHANGEOVER_MINUTES,
  };

  const queue = await getScheduledQueue();
  const lane = queue.lanes.find((item) => item.code === conveyor.code);
  const nextQueued = lane?.jobs[0];

  if (!nextQueued?.id) {
    return { conveyor, job: null };
  }

  const allJobs = await loadQueuedJobs();
  const job = allJobs.find((item) => item.id === nextQueued.id);
  if (!job) {
    return { conveyor, job: null };
  }

  const quantityLogged = await countLoggedQuantity(job.id);
  return {
    conveyor,
    job: toShopJob(job, quantityLogged, nextQueued.schedule),
  };
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
  const queue = await getScheduledQueue();
  const schedule = queue.lanes
    .flatMap((lane) => lane.jobs)
    .find((queued) => queued.id === jobId)?.schedule;

  return toShopJob(job, quantityLogged, schedule);
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

  if (quantityLogged < quantityPlanned && !reason?.trim()) {
    throw new Error("REASON_REQUIRED");
  }

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
    code: machine.code as MachineCode,
    name: machine.title,
    dailyRatePallets: machine.dailyRate,
    rotationHours: machine.rotationHours ?? DEFAULT_ROTATION_HOURS,
    currentWidthMm: machine.currentWidthMm ?? 0,
    assignedPersonIds: assignedByMachine.get(machine.id) ?? [],
  }));

  return { people, machines: adminMachines };
}

export async function switchWorkerConveyor(
  userId: string,
  machineCode: MachineCode,
): Promise<NextJobResponse> {
  const data = await getAssignments();
  const target = data.machines.find((machine) => machine.code === machineCode);
  if (!target) throw new Error("Konvejeris nerastas.");

  const assignments = data.machines.flatMap((machine) =>
    machine.assignedPersonIds
      .filter((personId) => personId !== userId)
      .map((personId) => ({ personId, machineId: machine.id })),
  );
  assignments.push({ personId: userId, machineId: target.id });

  await saveAssignments(assignments);
  return getNextJobForUser(userId);
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
