import { inArray } from "drizzle-orm";
import { db, initializeDatabase } from "../src/lib/db";
import { tiles } from "../src/lib/db/schema";

async function main() {
  initializeDatabase();
  const widths = [6, 15, 16, 25, 35, 44, 45, 46, 56];
  const rows = await db
    .select({ widthMm: tiles.widthMm, bubbleId: tiles.bubbleId })
    .from(tiles)
    .where(inArray(tiles.widthMm, widths));
  console.log(
    "stress widths:",
    rows.map((r) => r.widthMm).sort((a, b) => a - b),
  );
}

main();
