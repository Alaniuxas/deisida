import { requireUser } from "@/lib/auth";
import { getProposalById, proposalToForm, saveProposal } from "@/lib/db/proposals";
import type { Proposal } from "@/lib/types";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser(["admin", "pardavimai"]);
    const { id } = await context.params;
    const proposal = await getProposalById(id);
    if (!proposal) return jsonError("Pasiūlymas nerastas.", 404);
    return jsonOk({ proposal, form: proposalToForm(proposal, proposal.lines) });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser(["admin", "pardavimai"]);
    const { id } = await context.params;
    const body = await request.json();
    const proposal = body.proposal as Proposal;
    const status = body.status as "draft" | "sent" | "confirmed" | "in_production" | undefined;

    if (!proposal) return jsonError("Trūksta pasiūlymo duomenų.");

    const saved = await saveProposal(proposal, {
      id,
      status,
      createdById: user.userId,
      clientId: body.clientId as string | undefined,
    });

    return jsonOk({ proposal: saved });
  } catch (error) {
    return handleApiError(error);
  }
}
