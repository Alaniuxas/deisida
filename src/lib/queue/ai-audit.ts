import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import type { LockedWeek } from "./week";
import {
  alignAiCommentsWithRebalance,
  REBALANCE_RULES_FOR_AI,
  type RebalanceState,
} from "./rebalance";

export interface AuditJobSummary {
  jobId: string;
  machineCode: string;
  widthMm: number;
  storisMm: number;
  plannedStart: string;
  plannedEnd: string;
  lockedWeek: boolean;
}

export interface AuditOverrideSummary {
  jobId: string;
  fromMachine: string | null;
  toMachine: string | null;
  reason: string;
  createdAt: string;
}

export interface AuditMachineSummary {
  code: string;
  currentWidthMm: number | null;
}

export interface AuditInput {
  lockedWeek: LockedWeek;
  jobs: AuditJobSummary[];
  overrides: AuditOverrideSummary[];
  machineCodes: string[];
  machines: AuditMachineSummary[];
  rebalanceState: RebalanceState;
}

export interface AuditResult {
  comments: string[];
  source: "claude" | "mock";
}

const DEFAULT_MODEL_ID = process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-5";
const MODEL = anthropic(DEFAULT_MODEL_ID);

function heuristicComments(input: AuditInput): string[] {
  if (!input.rebalanceState.canRebalance) {
    return [];
  }

  const comments: string[] = [];
  const next = input.rebalanceState.nextMove;
  if (next) {
    comments.push(
      `${next.donorCode} → ${next.receiverCode}: perkelti ${next.candidate.widthMm} mm darbą (${input.rebalanceState.pendingMoveCount} galimi perkėlimai).`,
    );
  }

  return comments.slice(0, 5);
}

export async function auditQueuePlan(input: AuditInput): Promise<AuditResult> {
  const mock = heuristicComments(input);
  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      comments: mock,
      source: "mock",
    };
  }

  const prompt = `Tu esi Deisida gamybos eilės auditorius.
Grąžink tik 3–5 trumpas lietuviškas eilutes (be įžangos, be numeracijos, be markdown).
Kiekviena eilutė: [STAKLĖ] konkretus veiksmas arba problema.

${REBALANCE_RULES_FOR_AI}

Dabartinė automatinio perskirstymo būsena: ${JSON.stringify({
    canRebalance: input.rebalanceState.canRebalance,
    pendingMoveCount: input.rebalanceState.pendingMoveCount,
    reason: input.rebalanceState.reason,
    blockers: input.rebalanceState.blockers,
    nextMove: input.rebalanceState.nextMove
      ? {
          from: input.rebalanceState.nextMove.donorCode,
          to: input.rebalanceState.nextMove.receiverCode,
          widthMm: input.rebalanceState.nextMove.candidate.widthMm,
        }
      : null,
  })}

Jei canRebalance=false — NESIŪLYK automatinio perkėlimo; paaiškink kodėl (plotis ±5 mm).
Jei canRebalance=true — galima siūlyti tik tuos perkėlimus, kuriuos leidžia būsena.

Užrakinta savaitė: ${input.lockedWeek.startIso} – ${input.lockedWeek.endIso}
Staklės ir admin plotis (mm): ${JSON.stringify(input.machines)}
Darbų skaičius per staklę: ${JSON.stringify(
    Object.fromEntries(
      input.machineCodes.map((code) => [
        code,
        weekJobs(input).filter((job) => job.machine === code).length,
      ]),
    ),
  )}
Darbai: ${JSON.stringify(weekJobs(input).slice(0, 40))}
Overrides: ${JSON.stringify(input.overrides.slice(0, 10))}`;

  try {
    const { text } = await generateText({
      model: MODEL,
      prompt,
    });
    const comments = alignAiCommentsWithRebalance(
      text
        .split(/\n+/)
        .map((line) => line.replace(/^[\s\-*•\d.]+/, "").trim())
        .filter((line) => line.length > 6 && !/^išanalizav/i.test(line))
        .slice(0, 5),
      input.rebalanceState,
    );
    if (comments.length === 0) {
      return { comments: [], source: "claude" };
    }
    return { comments, source: "claude" };
  } catch {
    return {
      comments: alignAiCommentsWithRebalance(
        [
          "AI patarimų generavimas laikinai nepasiekiamas — rodomos automatinės pastabos.",
          ...mock,
        ],
        input.rebalanceState,
      ),
      source: "mock",
    };
  }
}

function weekJobs(input: AuditInput) {
  return input.jobs
    .filter((job) => job.lockedWeek)
    .map((job) => ({
      machine: job.machineCode,
      widthMm: job.widthMm,
      storisMm: job.storisMm,
      start: job.plannedStart,
    }));
}
