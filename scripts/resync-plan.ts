import { desc } from "drizzle-orm";
import { db, initializeDatabase } from "../src/lib/db";
import { queuePlanRuns } from "../src/lib/db/schema";
import { resyncPlanLanes } from "../src/lib/queue/plan";

async function main() {
  initializeDatabase();
  const [run] = await db
    .select()
    .from(queuePlanRuns)
    .orderBy(desc(queuePlanRuns.generatedAt))
    .limit(1);
  if (!run) {
    console.log("No plan run");
    return;
  }
  const count = await resyncPlanLanes(run.id);
  console.log(`Resynced ${count} items for week ${run.lockedWeekStart} – ${run.lockedWeekEnd}`);
}

main().catch(console.error);
