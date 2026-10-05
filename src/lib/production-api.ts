import {
  AssignmentsRequest,
  AssignmentsResponse,
  CreateRotationPeriodRequest,
  FinishJobRequest,
  FinishJobResponse,
  MachinePatchRequest,
  NextJobResponse,
  ProductionApiError,
  QueueResponse,
  ReassignRotationRequest,
  UpdateRotationPeriodRequest,
  RotationsAdminData,
  ShopJob,
} from "@/lib/production-types";

async function parseJson<T>(response: Response): Promise<T | null> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function classifyError(response: Response): ProductionApiError {
  if (response.status === 404) {
    return new ProductionApiError(
      "API dar nepasiekiama. Duomenys bus rodomi, kai backend bus paruoštas.",
      "not_found",
      404,
    );
  }
  return new ProductionApiError(
    `Serverio klaida (${response.status})`,
    "server",
    response.status,
  );
}

async function request<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  try {
    const response = await fetch(path, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });

    if (!response.ok) {
      const errorBody = await parseJson<{ error?: string }>(response);
      if (errorBody?.error) {
        throw new ProductionApiError(
          errorBody.error,
          response.status === 404 ? "not_found" : "server",
          response.status,
        );
      }
      throw classifyError(response);
    }

    const data = await parseJson<T>(response);
    return data as T;
  } catch (error) {
    if (error instanceof ProductionApiError) {
      throw error;
    }
    throw new ProductionApiError(
      "Nepavyko prisijungti prie serverio.",
      "network",
    );
  }
}

export async function fetchNextJob(): Promise<NextJobResponse> {
  return request<NextJobResponse>("/api/jobs/next");
}

export async function switchConveyor(
  machineCode: string,
): Promise<NextJobResponse> {
  return request<NextJobResponse>("/api/jobs/conveyor", {
    method: "POST",
    body: JSON.stringify({ machineCode }),
  });
}

export async function logPallet(jobId: string): Promise<ShopJob> {
  return request<ShopJob>(`/api/jobs/${jobId}/pallet`, { method: "POST" });
}

export async function finishJob(
  jobId: string,
  body: FinishJobRequest,
): Promise<FinishJobResponse> {
  return request<FinishJobResponse>(`/api/jobs/${jobId}/finish`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function fetchQueue(signal?: AbortSignal): Promise<QueueResponse> {
  return request<QueueResponse>("/api/jobs/queue", { signal });
}

export async function fetchAssignments(): Promise<AssignmentsResponse> {
  return request<AssignmentsResponse>("/api/admin/assignments");
}

export async function saveAssignments(
  body: AssignmentsRequest,
): Promise<AssignmentsResponse> {
  return request<AssignmentsResponse>("/api/admin/assignments", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function patchMachine(
  machineId: string,
  body: MachinePatchRequest,
): Promise<AssignmentsResponse> {
  return request<AssignmentsResponse>(`/api/admin/machines/${machineId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function fetchRotations(): Promise<RotationsAdminData> {
  return request<RotationsAdminData>("/api/admin/rotations");
}

export async function createRotationPeriod(
  body: CreateRotationPeriodRequest,
): Promise<RotationsAdminData> {
  return request<RotationsAdminData>("/api/admin/rotations", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function reassignRotation(
  body: ReassignRotationRequest,
): Promise<RotationsAdminData> {
  return request<RotationsAdminData>("/api/admin/rotations", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function updateRotationPeriod(
  body: UpdateRotationPeriodRequest,
): Promise<RotationsAdminData> {
  return request<RotationsAdminData>("/api/admin/rotations", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}
