import { eq, inArray, lte } from "drizzle-orm";
import { db, initializeDatabase } from "../src/lib/db";
import { jobs, proposalLines, tiles } from "../src/lib/db/schema";
import { normalizeArchivePieces } from "../src/lib/queue/archive-quantities";

const PIECE_THRESHOLD = 25;

async function main(): Promise<void> {
  initializeDatabase();

  const rows = await db
    .select({
      job: jobs,
      qpp: tiles.quantityPerPallet,
    })
    .from(jobs)
    .innerJoin(tiles, eq(jobs.tileId, tiles.id))
    .where(inArray(jobs.status, ["queued", "in_progress"]));

  const tiny = rows.filter((row) => row.job.pieceCount <= PIECE_THRESHOLD);
  if (tiny.length === 0) {
    console.log("No tiny jobs to fix.");
    return;
  }

  for (const { job, qpp } of tiny) {
    const pieces = normalizeArchivePieces(job.quantity, qpp);
    await db
      .update(jobs)
      .set({
        quantity: pieces,
        quantityUnit: "pieces",
        pieceCount: pieces,
      })
      .where(eq(jobs.id, job.id));
    await db
      .update(proposalLines)
      .set({
        quantity: pieces,
        quantityUnit: "pieces",
      })
      .where(eq(proposalLines.id, job.proposalLineId));
    console.log(
      `Updated ${job.id.slice(0, 8)}: ${job.pieceCount} → ${pieces} vnt. (qpp=${qpp})`,
    );
  }

  console.log(`\nFixed ${tiny.length} jobs. Paleiskite: npm run queue:plan`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
