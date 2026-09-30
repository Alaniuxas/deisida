import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { confirmProposal, saveProposal } from "@/lib/db/proposals";
import { getAllTiles } from "@/lib/db/tiles";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import {
  proposalFromFormData,
  proposalToQueryString,
} from "@/lib/proposal-form";
import { validateProposal } from "@/lib/proposal-utils";

function redirectToPath(path: string): NextResponse {
  return new NextResponse(null, {
    status: 303,
    headers: { Location: path },
  });
}

function isFormPost(contentType: string): boolean {
  return (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  );
}

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  const formPost = isFormPost(contentType);

  try {
    const user = await requireUser(["admin", "pardavimai"]);
    const form = await request.formData();
    const intent = String(form.get("intent") ?? "confirm").trim();
    const proposalId = String(form.get("proposalId") ?? "").trim() || undefined;
    const proposal = proposalFromFormData(form);
    const catalog = await getAllTiles();
    const errors = validateProposal(proposal, catalog);

    if (errors.length > 0) {
      if (formPost) {
        const query = proposalToQueryString(proposal);
        return redirectToPath(
          `/pasiulymai/naujas?error=${encodeURIComponent(errors[0])}&${query}`,
        );
      }
      return jsonError(errors[0]);
    }

    const status =
      intent === "sent" || intent === "confirm" ? "sent" : "draft";
    const saved = await saveProposal(proposal, {
      id: proposalId,
      status,
      createdById: user.userId,
    });

    if (intent === "confirm") {
      const jobsCreated = await confirmProposal(saved.id);
      if (formPost) {
        return redirectToPath(
          `/eile?confirmed=${encodeURIComponent(saved.number)}&jobs=${jobsCreated}`,
        );
      }
      return jsonOk({ proposal: saved, jobsCreated });
    }

    if (formPost) {
      return redirectToPath(`/pasiulymai/${saved.id}?saved=1`);
    }
    return jsonOk({ proposal: saved });
  } catch (error) {
    if (formPost) {
      const message =
        error instanceof Error && error.message === "UNAUTHORIZED"
          ? "Reikalingas prisijungimas."
          : error instanceof Error
            ? error.message
            : "Nepavyko išsaugoti.";
      if (message === "Reikalingas prisijungimas." || (error instanceof Error && error.message === "UNAUTHORIZED")) {
        return redirectToPath("/prisijungti?next=/pasiulymai/naujas");
      }
      return redirectToPath(
        `/pasiulymai/naujas?error=${encodeURIComponent(message)}`,
      );
    }
    return handleApiError(error);
  }
}
