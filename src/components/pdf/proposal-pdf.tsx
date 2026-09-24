"use client";

import { pdf } from "@react-pdf/renderer";
import type { Proposal } from "@/lib/types";
import { proposalDownloadFilename } from "@/lib/proposal-utils";
import { ClientProposalDocument } from "@/lib/client-proposal-pdf-document";
import { ProductionProposalDocument } from "@/lib/production-proposal-pdf-document";

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadClientProposalPdf(proposal: Proposal): Promise<string> {
  const filename = proposalDownloadFilename(proposal.number, "Klientui");
  const blob = await pdf(<ClientProposalDocument proposal={proposal} />).toBlob();
  triggerDownload(blob, filename);
  return filename;
}

export async function downloadProductionProposalPdf(
  proposal: Proposal,
): Promise<string> {
  const filename = proposalDownloadFilename(proposal.number, "Gamyba");
  const blob = await pdf(<ProductionProposalDocument proposal={proposal} />).toBlob();
  triggerDownload(blob, filename);
  return filename;
}

export { ClientProposalDocument } from "@/lib/client-proposal-pdf-document";
export { ProductionProposalDocument } from "@/lib/production-proposal-pdf-document";
