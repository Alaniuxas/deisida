import { requireUser } from "@/lib/auth";
import { listProposals, saveProposal } from "@/lib/db/proposals";
import type { Proposal } from "@/lib/types";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";

export async function GET() {
  try {
    await requireUser(["admin", "pardavimai"]);
    const proposals = await listProposals();
    return jsonOk({ proposals });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser(["admin", "pardavimai"]);
    const body = await request.json();
    const proposal = body.proposal as Proposal;
    const status = (body.status as "draft" | "sent" | undefined) ?? "draft";

    if (!proposal) return jsonError("Trūksta pasiūlymo duomenų.");

    const saved = await saveProposal(proposal, {
      id: body.id as string | undefined,
      status,
      createdById: user.userId,
      clientId: body.clientId as string | undefined,
    });

    return jsonOk({ proposal: saved });
  } catch (error) {
    return handleApiError(error);
  }
}
