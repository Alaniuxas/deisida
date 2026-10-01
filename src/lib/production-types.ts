export type MachineCode = "KONV" | "KNEW";

export type MachineWidthSource = "stored" | "in_progress" | "queued" | "unset";

export interface ConveyorInfo {
  id: string;
  code: MachineCode;
  name: string;
  currentWidthMm?: number;
  dailyRatePallets?: number;
  rotationHours?: number;
  changeoverMinutes?: number;
}

export interface JobPackaging {
  packOnlyIntact?: boolean | null;
  packTwoParts?: boolean | null;
  packMoreThanTwoParts?: boolean | null;
  needLeftovers?: boolean | null;
  baseProtection?: boolean;
  bottomInterlayer?: boolean;
  rowInterlayer?: boolean;
  summary?: string[];
}

export interface JobScheduleInfo {
  widthMm: number;
  deadline: string;
  conveyorCode: MachineCode;
  conveyorName: string;
  machineCurrentWidthMm: number;
  dailyRatePallets: number;
  rotationHours: number;
  changeoverMinutes: number;
  quantityPallets: number;
  productionHours: number;
  changeoverHours: number;
  durationHours: number;
  estimatedStart: string;
  estimatedEnd: string;
  positionInQueue: number;
  requiresChangeover: boolean;
  assignmentReason: string;
}

export interface ShopJob {
  id: string;
  tileName: string;
  proposalNumber?: string;
  storisMm: number;
  quantityPlanned: number;
  quantityLogged: number;
  quantityUnit: "pallets" | "pieces";
  remaining: number;
  packaging: JobPackaging;
  client?: string;
  object?: string;
  address?: string;
  pjovimas?: string;
  schedule?: JobScheduleInfo;
}

export interface NextJobResponse {
  conveyor?: ConveyorInfo | null;
  job?: ShopJob | null;
}

export interface FinishJobRequest {
  reason?: string;
}

export interface FinishJobResponse {
  ok: boolean;
  completionPercent: number;
  managerSignalSaved?: boolean;
}

export interface QueueJob {
  id: string;
  tileName: string;
  proposalNumber?: string;
  client: string;
  object?: string;
  deadline: string;
  storisMm: number;
  widthMm: number;
  quantityPlanned: number;
  quantityUnit: "pallets" | "pieces";
  conveyorCode?: MachineCode;
  schedule?: JobScheduleInfo;
}

export interface QueueWidthGroup {
  widthMm: number;
  jobs: QueueJob[];
}

export interface QueueLane {
  code: MachineCode;
  name: string;
  currentWidthMm: number;
  widthSource: MachineWidthSource;
  widthHint: string | null;
  dailyRatePallets: number;
  rotationHours: number;
  changeoverMinutes: number;
  jobs: QueueJob[];
}

export interface QueueResponse {
  lanes: QueueLane[];
  groups: QueueWidthGroup[];
}

export interface Person {
  id: string;
  name: string;
}

export interface Machine {
  id: string;
  code: MachineCode;
  name: string;
  dailyRatePallets: number;
  rotationHours: number;
  currentWidthMm: number;
  storedWidthMm: number;
  widthSource: MachineWidthSource;
  widthHint: string | null;
  assignedPersonIds: string[];
}

export interface AssignmentsResponse {
  people: Person[];
  machines: Machine[];
  rotations?: RotationsAdminData;
}

export interface WorkNorm {
  id: string;
  machineCode: MachineCode;
  label: string;
  minPiecesPerDay: number;
  unit: string;
  sourceRow: string | null;
}

export interface RotationPeriodSummary {
  id: string;
  startDate: string;
  endDate: string;
  createdAt: string;
  note: string | null;
  isActive: boolean;
}

export interface RotationHistoryEntry {
  id: string;
  changedAt: string;
  personName: string;
  fromCode: MachineCode | null;
  toCode: MachineCode | null;
  reason: string | null;
  action: "plan" | "reassign" | "release";
  changedByName: string | null;
  periodStartDate: string;
  periodEndDate: string;
}

export interface RotationsAdminData {
  periods: RotationPeriodSummary[];
  activePeriod: RotationPeriodSummary | null;
  activeAssignments: Record<string, string[]>;
  history: RotationHistoryEntry[];
  workNorms: WorkNorm[];
}

export interface CreateRotationPeriodRequest {
  startDate: string;
  endDate?: string;
  note?: string;
  assignments: { personId: string; machineId: string | null }[];
}

export interface ReassignRotationRequest {
  periodId: string;
  personId: string;
  machineId: string | null;
  reason: string;
}

export interface AssignmentsRequest {
  assignments: { personId: string; machineId: string }[];
}

export interface MachinePatchRequest {
  dailyRatePallets?: number;
  rotationHours?: number;
  currentWidthMm?: number;
}

export type ApiErrorKind = "not_found" | "network" | "server" | "unknown";

export class ProductionApiError extends Error {
  kind: ApiErrorKind;
  status?: number;

  constructor(message: string, kind: ApiErrorKind, status?: number) {
    super(message);
    this.name = "ProductionApiError";
    this.kind = kind;
    this.status = status;
  }
}
