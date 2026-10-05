import { db, initializeDatabase } from "../src/lib/db";
import { queueOverrides, queuePlanItems, queuePlanRuns } from "../src/lib/db/schema";

async function main() {
  initializeDatabase();
  await db.delete(queueOverrides);
  await db.delete(queuePlanItems);
  await db.delete(queuePlanRuns);
  console.log("Queue plans cleared.");
}

main();
