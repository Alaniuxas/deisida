import { getScheduledQueue } from "../src/lib/queue/service";

async function main() {
  const queue = await getScheduledQueue();
  const nk1 = queue.lanes.find((l) => l.code === "NK1" || l.shopCode === "NK1");
  if (!nk1) {
    console.log("NK1 lane not found", queue.lanes.map((l) => l.code));
    return;
  }
  for (const job of nk1.jobs) {
    console.log(
      `#${job.schedule?.positionInQueue}`,
      job.proposalNumber,
      `w${job.widthMm}`,
      `start=${job.schedule?.estimatedStart}`,
      `end=${job.schedule?.estimatedEnd}`,
      `chg=${job.schedule?.changeoverHours}h`,
      `prod=${job.schedule?.productionHours}h`,
      job.schedule?.priority,
    );
  }
}

main().catch(console.error);
