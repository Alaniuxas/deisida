import { applyPromptCorrection } from "../src/lib/prompt-corrections";
import { createDefaultProposal, validateProposal } from "../src/lib/proposal-utils";

let proposal = createDefaultProposal();
proposal.client = "UAB Statyba";
proposal.object = "Vilniaus g. 12";

const commands = [
  "storis: 25",
  "pakuoti tik neskilusi: taip",
  "likučiai: ne",
  "bazinė apsauga",
  "Pridedame papildomą garantiją 12 mėn.",
];

for (const cmd of commands) {
  const result = applyPromptCorrection(proposal, cmd);
  proposal = result.proposal;
  console.log(`${cmd} => ${result.messages[0]}`);
}

console.log("valid", validateProposal(proposal).length === 0);
console.log("extra", proposal.extraClauses);
console.log("packIntact", proposal.packaging.packOnlyIntact);
