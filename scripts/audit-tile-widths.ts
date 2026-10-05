import { db, initializeDatabase } from "../src/lib/db";
import { tiles } from "../src/lib/db/schema";

async function main() {
  initializeDatabase();
  const rows = await db.select({ w: tiles.widthMm, name: tiles.name }).from(tiles);
  const set = new Set(rows.map((r) => r.w));
  const sorted = [...set].sort((a, b) => a - b);
  console.log("tile width count:", sorted.length);
  console.log("9-19:", sorted.filter((w) => w >= 9 && w <= 19));
  console.log("45-56:", sorted.filter((w) => w >= 45 && w <= 56));
}

main();
