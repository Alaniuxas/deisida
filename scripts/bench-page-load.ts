import { performance } from "node:perf_hooks";
import { listProposalsPage } from "../src/lib/db/proposals";
import { getScheduledQueue, getAssignments } from "../src/lib/queue/service";

async function bench(label: string, fn: () => Promise<unknown>) {
  const start = performance.now();
  await fn();
  console.log(`${label}: ${(performance.now() - start).toFixed(0)} ms`);
}

async function main() {
  await bench("listProposalsPage(20)", () =>
    listProposalsPage({ limit: 20, offset: 0 }),
  );
  await bench("getScheduledQueue", () => getScheduledQueue());
  await bench("getScheduledQueue (cached)", () => getScheduledQueue());
  await bench("getAssignments", () => getAssignments());
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
