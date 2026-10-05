/**
 * Sukuria vieną patvirtintą pasiūlymą, kurį galima iškart įtraukti į eilę (queue:plan).
 *
 *   npx tsx scripts/seed-quick-proposal.ts
 *   npx tsx scripts/seed-quick-proposal.ts --width=55 --pieces=1200
 */
import { eq } from "drizzle-orm";
import { initializeDatabase } from "../src/lib/db";
import { db } from "../src/lib/db";
import { proposals, tiles, users } from "../src/lib/db/schema";
import { confirmProposal, saveProposal } from "../src/lib/db/proposals";
import { defaultPackaging } from "../src/lib/types";
import { lockedWeekForPlanner } from "../src/lib/queue/week";

function parseArg(name: string, fallback: string): string {
  const prefix = `--${name}=`;
  const hit = process.argv.find((arg) => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
}

async function main() {
  initializeDatabase();

  const targetWidth = Number.parseInt(parseArg("width", "55"), 10);
  const targetPieces = Number.parseInt(parseArg("pieces", "800"), 10);
  const week = lockedWeekForPlanner();
  const deadline = week.endIso.slice(0, 10);

  const [tile] = await db
    .select()
    .from(tiles)
    .where(eq(tiles.widthMm, targetWidth))
    .limit(1);

  const fallbackTile = tile
    ? tile
    : (
        await db
          .select()
          .from(tiles)
          .orderBy(tiles.widthMm)
          .limit(1)
      )[0];

  if (!fallbackTile) {
    throw new Error("DB neturi plytelių — paleiskite db:import.");
  }

  const [creator] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, "danas@deisida.lt"))
    .limit(1);

  const existing = await db
    .select({ number: proposals.number })
    .from(proposals)
    .where(eq(proposals.comment, "quick-queue-test"));
  const suffix = existing.length + 1;
  const number = `QUICK-${deadline.replace(/-/g, "")}-${suffix}`;

  const saved = await saveProposal(
    {
      number,
      validUntil: deadline,
      serviceDeadline: deadline,
      client: "Demo klientas (greitas testas)",
      object: `Plotis ${fallbackTile.widthMm} mm`,
      address: "",
      comment: "quick-queue-test",
      pjovimas: "",
      packaging: defaultPackaging(),
      tileLines: [
        {
          id: crypto.randomUUID(),
          tileId: fallbackTile.id,
          quantity: targetPieces,
          quantityUnit: "pieces",
        },
      ],
      extraClauses: [],
    },
    {
      status: "sent",
      createdById: creator?.id,
    },
  );

  const jobsCreated = await confirmProposal(saved.id);

  console.log(
    JSON.stringify(
      {
        proposalNumber: number,
        proposalId: saved.id,
        widthMm: fallbackTile.widthMm,
        pieceCount: targetPieces,
        deadline,
        jobsCreated,
        next: "npm run queue:plan",
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
