import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { buildMoveSuggestionsForJob } from "@/lib/queue/move-context";

export async function GET(request: Request) {
  try {
    await requireUser(["admin", "pardavimai"]);
  } catch {
    return NextResponse.json({ error: "Neprisijungta." }, { status: 401 });
  }

  const url = new URL(request.url);
  const jobId = url.searchParams.get("jobId")?.trim();
  const cutBy = url.searchParams.get("cutBy")?.trim();
  if (!jobId || !cutBy) {
    return NextResponse.json(
      { error: "Reikia jobId ir cutBy (ISO data)." },
      { status: 400 },
    );
  }

  const suggestions = await buildMoveSuggestionsForJob(jobId, cutBy);
  if (suggestions === null) {
    return NextResponse.json({ error: "Darbas nerastas arba nėra plano." }, { status: 404 });
  }

  return NextResponse.json({ suggestions });
}
