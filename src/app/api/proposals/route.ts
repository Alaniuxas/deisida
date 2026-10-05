import { requireUser } from "@/lib/auth";
import {
  listProposals,
  listProposalsPage,
  saveProposal,
} from "@/lib/db/proposals";
import type { ProposalRow } from "@/lib/db/schema";
import type { Proposal } from "@/lib/types";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";

const PAGE_SIZE_DEFAULT = 20;
const PAGE_SIZE_MAX = 50;

export async function GET(request: Request) {
  try {
    await requireUser(["admin", "pardavimai"]);
    const { searchParams } = new URL(request.url);
    const paginate = searchParams.has("limit") || searchParams.has("offset");

    if (!paginate) {
      const proposals = await listProposals();
      return jsonOk({ proposals });
    }

    const limit = Math.min(
      Math.max(Number(searchParams.get("limit") ?? PAGE_SIZE_DEFAULT), 1),
      PAGE_SIZE_MAX,
    );
    const offset = Math.max(Number(searchParams.get("offset") ?? 0), 0);
    const status = searchParams.get("status") as ProposalRow["status"] | null;
    const validStatuses: ProposalRow["status"][] = [
      "draft",
      "sent",
      "confirmed",
      "in_production",
    ];

    const page = await listProposalsPage({
      limit,
      offset,
      number: searchParams.get("number") ?? undefined,
      client: searchParams.get("client") ?? undefined,
      object: searchParams.get("object") ?? undefined,
      status:
        status && validStatuses.includes(status) ? status : undefined,
    });

    return jsonOk(page);
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
