"use client";

import { pdf } from "@react-pdf/renderer";
import type { Proposal } from "@/lib/types";
import { ClientProposalDocument } from "@/lib/client-proposal-pdf-document";
import { ProductionProposalDocument } from "@/lib/production-proposal-pdf-document";

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function safeFilename(number: string, suffix: string): string {
  return `${number.replace(/\s+/g, "_")}_${suffix}.pdf`;
}

export async function downloadClientProposalPdf(proposal: Proposal): Promise<void> {
  const blob = await pdf(<ClientProposalDocument proposal={proposal} />).toBlob();
  triggerDownload(blob, safeFilename(proposal.number, "Pasiulymas"));
}

export async function downloadProductionProposalPdf(
  proposal: Proposal,
): Promise<void> {
  const blob = await pdf(<ProductionProposalDocument proposal={proposal} />).toBlob();
  triggerDownload(blob, safeFilename(proposal.number, "Gamyba"));
}

export { ClientProposalDocument } from "@/lib/client-proposal-pdf-document";
export { ProductionProposalDocument } from "@/lib/production-proposal-pdf-document";
