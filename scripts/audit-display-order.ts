import { initializeDatabase } from "../src/lib/db";
import { getScheduledQueue } from "../src/lib/queue/service";

async function main() {
  initializeDatabase();
  const queue = await getScheduledQueue();
  for (const lane of queue.lanes) {
    const starts = lane.jobs.map((job) => job.schedule?.estimatedStart ?? "");
    const sorted = [...starts].sort();
    const ok = starts.every((start, index) => start === sorted[index]);
    console.log(
      lane.code,
      lane.jobs.length,
      "jobs",
      ok ? "OK chronological" : "OUT OF ORDER",
    );
    if (!ok) {
      for (const job of lane.jobs) {
        console.log(
          " ",
          job.schedule?.estimatedStart?.slice(0, 16),
          "w" + job.widthMm,
          job.proposalNumber,
        );
      }
    }
  }
}

main();
