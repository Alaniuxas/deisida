import { notFound } from "next/navigation";
import { ProposalCreator } from "@/components/proposal-creator";
import { getAllTiles } from "@/lib/db/tiles";
import { getProposalById, proposalToForm } from "@/lib/db/proposals";

export const dynamic = "force-dynamic";

export default async function RedaguotiPasiulymaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ lines?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const requestedLines = Number(query.lines);
  const [catalog, proposal] = await Promise.all([
    getAllTiles(),
    getProposalById(id),
  ]);

  if (!proposal) notFound();

  const savedLineCount = proposal.lines.length;
  const initialLineCount = Number.isFinite(requestedLines)
    ? Math.min(Math.max(Math.trunc(requestedLines), savedLineCount), 10)
    : savedLineCount;

  return (
    <ProposalCreator
      key={`${proposal.id}-${initialLineCount}`}
      catalog={catalog}
      proposalId={proposal.id}
      initialProposal={proposalToForm(proposal, proposal.lines)}
      initialStatus={proposal.status}
      initialLineCount={initialLineCount}
    />
  );
}
