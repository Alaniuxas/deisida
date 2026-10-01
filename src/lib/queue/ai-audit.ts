import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import type { LockedWeek } from "./week";

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

export interface AuditInput {
  lockedWeek: LockedWeek;
  jobs: AuditJobSummary[];
  overrides: AuditOverrideSummary[];
  machineCodes: string[];
}

export interface AuditResult {
  comments: string[];
  source: "claude" | "mock";
}

const MODEL = anthropic("claude-sonnet-4-6");

function heuristicComments(input: AuditInput): string[] {
  const comments: string[] = [];
  const weekJobs = input.jobs.filter((job) => job.lockedWeek);
  for (const code of input.machineCodes) {
    const count = weekJobs.filter((job) => job.machineCode === code).length;
    if (count === 0) {
      comments.push(
        `${code} tuščia visą užrakintą savaitę (${input.lockedWeek.startIso}–${input.lockedWeek.endIso}).`,
      );
    }
  }
  if (input.overrides.length > 0) {
    comments.push(
      `Paskutiniai rankiniai keitimai: ${input.overrides.length} (naudoti kaip pavyzdžiai kitam penktadieniui, nepriskirti mm).`,
    );
  }
  if (comments.length === 0) {
    comments.push("Savaitės apkrova paskirstyta pagal P1/P2/P3; akivaizdžių tuščių staklių nėra.");
  }
  return comments;
}

export async function auditQueuePlan(input: AuditInput): Promise<AuditResult> {
  const mock = heuristicComments(input);
  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      comments: mock,
      source: "mock",
    };
  }

  const prompt = `Tu esi Deisida gamybos eilės auditorius. NEGALIMA perrūšiuoti darbų ar keisti mm priskyrimo.
Grąžink 3–6 trumpas lietuviškas pastabas (kiekviena eilutė atskira), pvz. tuščios staklės, netolygus krūvis, override istorijos pamokos.
Užrakinta savaitė: ${input.lockedWeek.startIso} – ${input.lockedWeek.endIso}
Staklės: ${input.machineCodes.join(", ")}
Darbai savaitėje: ${JSON.stringify(weekJobs(input), null, 2)}
Overrides: ${JSON.stringify(input.overrides.slice(0, 20), null, 2)}`;

  try {
    const { text } = await generateText({
      model: MODEL,
      prompt,
    });
    const comments = text
      .split(/\n+/)
      .map((line) => line.replace(/^[\s\-*•\d.]+/, "").trim())
      .filter((line) => line.length > 8)
      .slice(0, 8);
    if (comments.length === 0) {
      return { comments: mock, source: "mock" };
    }
    return { comments, source: "claude" };
  } catch {
    return {
      comments: [
        "AI patarimų generavimas laikinai nepasiekiamas — rodomos automatinės pastabos.",
        ...mock,
      ],
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
