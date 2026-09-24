import React from "react";
import { pdf } from "@react-pdf/renderer";
import fs from "node:fs";
import { ProposalDocument } from "../src/lib/proposal-pdf-document";
import { createDefaultProposal } from "../src/lib/proposal-utils";
import { applyPromptCorrection } from "../src/lib/prompt-corrections";

async function main() {
  const proposal = createDefaultProposal();
  proposal.client = "UAB Statyba";
  proposal.object = "Vilniaus g. 12";
  proposal.tileLines[0].storisMm = 25;
  proposal.tileLines[0].packaging.packOnlyIntact = true;
  proposal.tileLines[0].packaging.needLeftovers = false;
  proposal.tileLines[0].packaging.baseProtection = true;
  proposal.tileLines[0].packaging.bottomInterlayer = true;

  const corrected = applyPromptCorrection(
    proposal,
    "Pridedame papildomą garantiją 12 mėn.",
  );

  const blob = await pdf(
    React.createElement(ProposalDocument, { proposal: corrected.proposal }),
  ).toBlob();
  const buffer = Buffer.from(await blob.arrayBuffer());
  fs.writeFileSync("/tmp/deisida-test.pdf", buffer);

  console.log(
    JSON.stringify({
      pdfBytes: buffer.length,
      extraClauses: corrected.proposal.extraClauses,
      messages: corrected.messages,
    }),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
