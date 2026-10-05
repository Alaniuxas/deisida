import { eq, sql } from "drizzle-orm";
import { db, initializeDatabase } from "../src/lib/db";
import { discs, tiles } from "../src/lib/db/schema";
import { formatDiscLabel, isBubbleDiscId } from "../src/lib/db/discs";

async function main(): Promise<void> {
  initializeDatabase();

  const discRows = await db.select().from(discs);
  const discLabelById = new Map(
    discRows.map((row) => [
      row.id,
      formatDiscLabel({
        id: row.id,
        name: row.name,
        diameterMm: row.diameterMm ?? undefined,
        workId: row.workId ?? undefined,
      }),
    ]),
  );

  const tileRows = await db.select().from(tiles);
  let updated = 0;

  for (const row of tileRows) {
    const currentDisc = row.disc?.trim() || "";
    const currentDiscId = row.discId?.trim() || "";
    let nextDiscId = currentDiscId || null;
    let nextDisc = row.disc || null;

    if (!nextDiscId && isBubbleDiscId(currentDisc)) {
      nextDiscId = currentDisc;
    }

    if (nextDiscId && discLabelById.has(nextDiscId)) {
      nextDisc = discLabelById.get(nextDiscId) ?? nextDisc;
    } else if (nextDiscId && !discLabelById.has(nextDiscId)) {
      continue;
    }

    if (nextDiscId === (row.discId || null) && nextDisc === (row.disc || null)) {
      continue;
    }

    await db
      .update(tiles)
      .set({ discId: nextDiscId, disc: nextDisc })
      .where(eq(tiles.id, row.id));
    updated += 1;
  }

  const unresolved = await db
    .select({ cnt: sql<number>`count(*)` })
    .from(tiles)
    .where(sql`disc IS NOT NULL AND disc != '' AND disc GLOB '[0-9]*x[0-9]*'`);

  console.log(
    JSON.stringify(
      {
        discsInCatalog: discRows.length,
        tilesUpdated: updated,
        unresolvedBubbleDiscRefs: unresolved[0]?.cnt ?? 0,
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
