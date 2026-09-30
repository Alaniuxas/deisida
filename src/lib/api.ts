import { NextResponse } from "next/server";

export function jsonOk<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function handleApiError(error: unknown) {
  if (error instanceof Error) {
    if (error.message === "UNAUTHORIZED") {
      return jsonError("Reikalingas prisijungimas.", 401);
    }
    if (error.message === "FORBIDDEN") {
      return jsonError("Neturite teisių.", 403);
    }
    return jsonError(error.message, 400);
  }
  return jsonError("Nežinoma klaida.", 500);
}
