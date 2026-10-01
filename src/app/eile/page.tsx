import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getScheduledQueue } from "@/lib/queue/service";
import { EileQueueView } from "@/components/production/eile-queue-view";

export const dynamic = "force-dynamic";

export default async function EilePage({
  searchParams,
}: {
  searchParams: Promise<{
    confirmed?: string;
    jobs?: string;
    konvejeris?: string;
    moved?: string;
    error?: string;
  }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/prisijungti?next=/eile");
  if (!["admin", "pardavimai", "cechas"].includes(user.role)) {
    redirect("/pasiulymai");
  }

  const params = await searchParams;
  const queue = await getScheduledQueue();
  const notice =
    params.confirmed && params.jobs
      ? `Patvirtinta ${params.confirmed}: sukurta ${params.jobs} gamybos darbai.`
      : params.confirmed
        ? `Patvirtinta ${params.confirmed}.`
        : params.moved
          ? "Perkėlimas išsaugotas (override)."
          : params.error
            ? params.error
            : null;

  return (
    <EileQueueView
      data={queue}
      notice={notice}
      selectedCode={params.konvejeris}
      confirmed={params.confirmed}
      jobsCreated={params.jobs}
      canEdit={["admin", "pardavimai"].includes(user.role)}
      isAdmin={user.role === "admin"}
    />
  );
}
