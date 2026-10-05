import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { handleApiError } from "@/lib/api";
import { deleteMachineDowntime } from "@/lib/queue/machine-downtime";
import { replanActiveQueueRun } from "@/lib/queue/plan";

function redirectToPath(path: string): NextResponse {
  return new NextResponse(null, {
    status: 303,
    headers: { Location: path },
  });
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser(["admin"]);
    const { id } = await context.params;
    await deleteMachineDowntime(id);
    const replanned = await replanActiveQueueRun();
    const notice =
      replanned != null
        ? `Gedimas atšauktas — planas atkurtas (${replanned} darb.).`
        : "Gedimas atšauktas.";
    return redirectToPath(`/eile?notice=${encodeURIComponent(notice)}`);
  } catch (error) {
    return handleApiError(error);
  }
}
