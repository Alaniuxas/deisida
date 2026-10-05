import type { ProposalRow } from "@/lib/db/schema";

export type ProposalStatus = ProposalRow["status"];

export const PROPOSAL_STATUS_LABELS: Record<ProposalStatus, string> = {
  draft: "Juodraštis",
  sent: "Išsiųstas",
  confirmed: "Patvirtintas",
  in_production: "Gamyba",
};

export const PROPOSAL_STATUS_OPTIONS: ProposalStatus[] = [
  "draft",
  "sent",
  "confirmed",
  "in_production",
];
