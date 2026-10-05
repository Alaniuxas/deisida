import { initializeDatabase } from "../src/lib/db";
import { getScheduledQueue } from "../src/lib/queue/service";
import { buildLaneWidthSegments } from "../src/lib/queue/lane-segments";
import { DEFAULT_CHANGEOVER_MINUTES } from "../src/lib/queue/constants";

async function main() {
  initializeDatabase();
  const queue = await getScheduledQueue();
  let segments = 0;
  let withChangeover = 0;

  for (const lane of queue.lanes) {
    const built = buildLaneWidthSegments(
      lane.jobs,
      lane.storedWidthMm,
      lane.changeoverMinutes ?? DEFAULT_CHANGEOVER_MINUTES,
    );
    segments += built.length;
    withChangeover += built.filter((segment) => segment.requiresChangeover).length;
    const changeoverLanes = built.filter((segment) => segment.requiresChangeover);
    if (changeoverLanes.length > 0) {
      console.log(
        lane.code,
        changeoverLanes
          .map(
            (segment) =>
              `${segment.fromWidthMm ?? "?"}→${segment.widthMm}mm (${segment.jobs.length} d.)`,
          )
          .join(", "),
      );
    }
  }

  console.log(`\nReguliavimo blokai: ${withChangeover} / ${segments} pločio segmentų`);
}

main();
