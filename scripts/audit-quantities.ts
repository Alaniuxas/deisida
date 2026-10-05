import { db } from "../src/lib/db/index";
import { jobs, proposals, tiles } from "../src/lib/db/schema";
import { eq, inArray } from "drizzle-orm";

async function main() {
  const open = await db
    .select({
      job: jobs,
      proposal: proposals.number,
      qpp: tiles.quantityPerPallet,
    })
    .from(jobs)
    .innerJoin(proposals, eq(jobs.proposalId, proposals.id))
    .innerJoin(tiles, eq(jobs.tileId, tiles.id))
    .where(inArray(jobs.status, ["queued", "in_progress"]));

  const tiny = open.filter((r) => r.job.pieceCount <= 10);
  console.log(`Open jobs: ${open.length}, pieceCount <= 10: ${tiny.length}`);
  for (const r of tiny.slice(0, 15)) {
    console.log(
      r.proposal,
      `pieces=${r.job.pieceCount}`,
      `qty=${r.job.quantity}`,
      r.job.quantityUnit,
      `qpp=${r.qpp}`,
      `w${r.job.widthMm}`,
    );
  }

  const dei = open.filter((r) => r.proposal.includes("240710"));
  console.log("\nDEI240710 jobs:");
  for (const r of dei) {
    console.log(
      r.proposal,
      `pieces=${r.job.pieceCount}`,
      `qty=${r.job.quantity}`,
      r.job.quantityUnit,
      `qpp=${r.qpp}`,
      `w${r.job.widthMm}`,
    );
  }

  const stats = open.map((r) => r.job.pieceCount).sort((a, b) => a - b);
  console.log(
    "\nPieceCount min/median/max:",
    stats[0],
    stats[Math.floor(stats.length / 2)],
    stats[stats.length - 1],
  );
}

main().catch(console.error);
