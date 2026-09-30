import { notFound } from "next/navigation";
import { ProposalCreator } from "@/components/proposal-creator";
import { getAllTiles } from "@/lib/db/tiles";
import { getProposalById, proposalToForm } from "@/lib/db/proposals";

export const dynamic = "force-dynamic";

export default async function RedaguotiPasiulymaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [catalog, proposal] = await Promise.all([
    getAllTiles(),
    getProposalById(id),
  ]);

  if (!proposal) notFound();

  return (
    <ProposalCreator
      catalog={catalog}
      proposalId={proposal.id}
      initialProposal={proposalToForm(proposal, proposal.lines)}
      initialStatus={proposal.status}
    />
  );
}
