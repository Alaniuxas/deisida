import { requireUser } from "@/lib/auth";
import { confirmProposal, getProposalById } from "@/lib/db/proposals";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser(["admin", "pardavimai"]);
    const { id } = await context.params;
    const existing = await getProposalById(id);
    if (!existing) return jsonError("Pasiūlymas nerastas.", 404);

    const jobsCreated = await confirmProposal(id);
    const proposal = await getProposalById(id);
    return jsonOk({ jobsCreated, proposal });
  } catch (error) {
    return handleApiError(error);
  }
}
