import { initializeDatabase } from "../src/lib/db";
import { getScheduledQueue } from "../src/lib/queue/service";
import { buildLaneWidthSegments } from "../src/lib/queue/lane-segments";

async function main() {
  initializeDatabase();
  const queue = await getScheduledQueue();
  for (const lane of queue.lanes) {
    if (lane.jobs.length === 0) continue;
    const segments = buildLaneWidthSegments(
      lane.jobs,
      lane.storedWidthMm,
      lane.changeoverMinutes,
    );
    const changeovers = segments.filter((segment) => segment.requiresChangeover);
    console.log(
      lane.code,
      `admin=${lane.storedWidthMm}`,
      `jobs=${lane.jobs.length}`,
      `reguliavimų=${changeovers.length}`,
      changeovers.map(
        (segment) => `${segment.fromWidthMm}→${segment.widthMm}`,
      ),
    );
  }
}

main();
