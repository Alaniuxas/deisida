"use client";

import { pdf } from "@react-pdf/renderer";
import type { Proposal } from "@/lib/types";
import { ProposalDocument } from "@/lib/proposal-pdf-document";

export async function downloadProposalPdf(proposal: Proposal): Promise<void> {
  const blob = await pdf(<ProposalDocument proposal={proposal} />).toBlob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${proposal.number.replace(/\s+/g, "_")}.pdf`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export { ProposalDocument } from "@/lib/proposal-pdf-document";
