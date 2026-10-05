import type { machines } from "@/lib/db/schema";
import type { scheduleQueue } from "./schedule";

type LaneJob = {
  job: {
    id: string;
    status: string;
  };
  assignment: ReturnType<typeof scheduleQueue>[number];
};

export function orderLaneJobsForDisplay(
  laneJobs: LaneJob[],
  _machine: typeof machines.$inferSelect,
  usePlanOrder: boolean,
): LaneJob[] {
  const inProgress = laneJobs.filter(({ job }) => job.status === "in_progress");
  const queued = laneJobs.filter(({ job }) => job.status !== "in_progress");

  const byStartTime = (left: LaneJob, right: LaneJob) =>
    left.assignment.estimatedStart.getTime() - right.assignment.estimatedStart.getTime();

  if (!usePlanOrder) {
    return [...inProgress, ...queued].sort((left, right) => {
      if (left.job.status === "in_progress" && right.job.status !== "in_progress") {
        return -1;
      }
      if (right.job.status === "in_progress" && left.job.status !== "in_progress") {
        return 1;
      }
      return byStartTime(left, right);
    });
  }

  return [
    ...[...inProgress].sort(byStartTime),
    ...[...queued].sort(byStartTime),
  ];
}
