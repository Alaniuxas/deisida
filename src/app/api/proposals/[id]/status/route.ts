import { requireUser } from "@/lib/auth";
import { setProposalStatus } from "@/lib/db/proposals";
import type { ProposalRow } from "@/lib/db/schema";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";

const validStatuses: ProposalRow["status"][] = [
  "draft",
  "sent",
  "confirmed",
  "in_production",
];

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser(["admin", "pardavimai"]);
    const { id } = await context.params;
    const body = await request.json();
    const status = body.status as ProposalRow["status"];

    if (!status || !validStatuses.includes(status)) {
      return jsonError("Netinkama būsena.");
    }

    const proposal = await setProposalStatus(id, status);
    return jsonOk({ proposal });
  } catch (error) {
    return handleApiError(error);
  }
}
