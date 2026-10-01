import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import { switchWorkerConveyor } from "@/lib/queue/service";

function redirectToPath(path: string): NextResponse {
  return new NextResponse(null, {
    status: 303,
    headers: { Location: path },
  });
}

async function parseMachineCode(request: Request): Promise<string> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const body = await request.json();
    return String(body.machineCode ?? "").trim();
  }

  const form = await request.formData();
  return String(form.get("machineCode") ?? "").trim();
}

function isFormPost(contentType: string): boolean {
  return (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  );
}

export async function POST(request: Request) {
  try {
    const user = await requireUser(["admin", "cechas"]);
    const contentType = request.headers.get("content-type") ?? "";
    const machineCode = (await parseMachineCode(request)).trim();

    if (!machineCode) {
      if (isFormPost(contentType)) {
        return redirectToPath("/cechas?switchError=invalid");
      }
      return jsonError("Pasirinkite stakles.");
    }

    const next = await switchWorkerConveyor(user.userId, machineCode);

    if (isFormPost(contentType)) {
      return redirectToPath(`/cechas?switched=${machineCode}`);
    }

    return jsonOk(next);
  } catch (error) {
    const contentType = request.headers.get("content-type") ?? "";
    if (isFormPost(contentType)) {
      return redirectToPath("/cechas?switchError=failed");
    }
    return handleApiError(error);
  }
}
