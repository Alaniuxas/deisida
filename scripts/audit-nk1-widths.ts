import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { jobs, machines, proposals, queuePlanItems, queuePlanRuns } from "@/lib/db/schema";

async function main() {
  const machineRows = await db.select().from(machines);
  const nk1 = machineRows.find((m) => m.code === "NK1");
  if (!nk1) {
    console.log("NK1 not found");
    return;
  }

  const [run] = await db.select().from(queuePlanRuns).limit(1);
  if (!run) {
    console.log("No plan run");
    return;
  }

  const planItems = await db
    .select()
    .from(queuePlanItems)
    .where(eq(queuePlanItems.runId, run.id));

  const nk1Items = planItems
    .filter((item) => item.machineId === nk1.id)
    .sort(
      (a, b) =>
        new Date(a.plannedStart).getTime() - new Date(b.plannedStart).getTime(),
    );

  const jobIds = nk1Items.map((item) => item.jobId);
  const jobRows =
    jobIds.length > 0
      ? await db.select().from(jobs).where(inArray(jobs.id, jobIds))
      : [];
  const jobById = new Map(jobRows.map((row) => [row.id, row]));

  const proposalIds = [...new Set(jobRows.map((row) => row.proposalId).filter(Boolean))];
  const proposalRows =
    proposalIds.length > 0
      ? await db.select().from(proposals).where(inArray(proposals.id, proposalIds))
      : [];
  const proposalById = new Map(proposalRows.map((row) => [row.id, row]));

  const widthCounts = new Map<number, number>();
  const widthPieces = new Map<number, number>();
  let lastEnd: Date | null = null;

  for (const item of nk1Items) {
    const job = jobById.get(item.jobId);
    const width = item.widthMm || job?.widthMm || 0;
    widthCounts.set(width, (widthCounts.get(width) ?? 0) + 1);
    widthPieces.set(width, (widthPieces.get(width) ?? 0) + (job?.pieceCount ?? 0));
    const end = new Date(item.plannedEnd);
    if (!lastEnd || end > lastEnd) lastEnd = end;
  }

  console.log("Plan run:", run.id);
  console.log("Locked week:", run.lockedWeekStart, "→", run.lockedWeekEnd);
  console.log("NK1 jobs in plan:", nk1Items.length);
  console.log("NK1 last planned end:", lastEnd?.toISOString());
  console.log("\nWidth distribution (job count):");
  for (const [width, count] of [...widthCounts.entries()].sort(
    (a, b) => b[1] - a[1],
  )) {
    console.log(`  ${width} mm: ${count} jobs (${widthPieces.get(width)} vnt.)`);
  }

  const near100 = nk1Items.filter((item) => {
    const job = jobById.get(item.jobId);
    const width = item.widthMm || job?.widthMm || 0;
    return Math.abs(width - 100) <= 5;
  });
  console.log(
    `\n±5 mm from 100 mm: ${near100.length}/${nk1Items.length} jobs (${Math.round((near100.length / nk1Items.length) * 100)}%)`,
  );

  const proposalNumberSamples = new Map<string, number>();
  for (const item of nk1Items) {
    const job = jobById.get(item.jobId);
    if (!job?.proposalId) continue;
    const proposal = proposalById.get(job.proposalId);
    const num = proposal?.number ?? job.proposalId.slice(0, 8);
    proposalNumberSamples.set(num, (proposalNumberSamples.get(num) ?? 0) + 1);
  }

  console.log("\nSample proposals on NK1:");
  const seen = new Set<string>();
  for (const item of nk1Items) {
    const job = jobById.get(item.jobId);
    if (!job?.proposalId || seen.has(job.proposalId)) continue;
    seen.add(job.proposalId);
    const proposal = proposalById.get(job.proposalId);
    if (!proposal) continue;
    const lines = nk1Items.filter((i) => jobById.get(i.jobId)?.proposalId === job.proposalId);
    console.log(
      `  ${proposal.number} (${proposal.status}) — ${lines.length} NK1 line(s), widths: ${[...new Set(lines.map((i) => i.widthMm || jobById.get(i.jobId)?.widthMm))].join(", ")}mm`,
    );
    if (seen.size >= 10) break;
  }

  console.log("\nFirst 8 NK1 jobs:");
  for (const item of nk1Items.slice(0, 8)) {
    const job = jobById.get(item.jobId);
    const proposal = job?.proposalId ? proposalById.get(job.proposalId) : null;
    console.log(
      `  ${item.plannedStart.slice(0, 10)} → ${item.plannedEnd.slice(0, 10)} | ${item.widthMm || job?.widthMm}mm x${job?.pieceCount} | ${proposal?.number ?? "?"}`,
    );
  }

  console.log("\nLast 8 NK1 jobs:");
  for (const item of nk1Items.slice(-8)) {
    const job = jobById.get(item.jobId);
    const proposal = job?.proposalId ? proposalById.get(job.proposalId) : null;
    console.log(
      `  ${item.plannedStart.slice(0, 10)} → ${item.plannedEnd.slice(0, 10)} | ${item.widthMm || job?.widthMm}mm x${job?.pieceCount} | ${proposal?.number ?? "?"}`,
    );
  }

  // All machines comparison
  console.log("\n--- All shop machines ---");
  for (const machine of machineRows.filter((m) =>
    ["NK1", "NK2", "S1", "S2", "S4", "SK1"].includes(m.code),
  )) {
    const items = planItems.filter((i) => i.machineId === machine.id);
    const ends = items.map((i) => new Date(i.plannedEnd).getTime());
    const last = ends.length ? new Date(Math.max(...ends)) : null;
    const widths = new Map<number, number>();
    for (const item of items) {
      const job = jobById.get(item.jobId);
      const w = item.widthMm || job?.widthMm || 0;
      widths.set(w, (widths.get(w) ?? 0) + 1);
    }
    const topWidth = [...widths.entries()].sort((a, b) => b[1] - a[1])[0];
    console.log(
      `${machine.code} (magnet ${machine.currentWidthMm}mm): ${items.length} jobs, last end ${last?.toISOString().slice(0, 10) ?? "—"}, top width ${topWidth?.[0]}mm (${topWidth?.[1]} jobs)`,
    );
  }
}

main().catch(console.error);
