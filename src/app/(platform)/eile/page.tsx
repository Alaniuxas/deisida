import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listMachineDowntimesWithCodes } from "@/lib/queue/machine-downtime";
import { EileQueueLoader } from "@/components/production/eile-queue-loader";

export default async function EilePage({
  searchParams,
}: {
  searchParams: Promise<{
    confirmed?: string;
    jobs?: string;
    konvejeris?: string;
    moved?: string;
    rebalanced?: string;
    accepted?: string;
    reopened?: string;
    notice?: string;
    enqueued?: string;
    error?: string;
  }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/prisijungti?next=/eile");
  if (!["admin", "pardavimai", "cechas"].includes(user.role)) {
    redirect("/pasiulymai");
  }

  const params = await searchParams;
  const downtimes =
    user.role === "admin"
      ? (await listMachineDowntimesWithCodes()).map((row) => ({
          id: row.downtime.id,
          machineId: row.downtime.machineId,
          machineCode: row.machineCode,
          startAt: row.downtime.startAt,
          endAt: row.downtime.endAt,
          reason: row.downtime.reason,
        }))
      : [];

  const notice =
    params.notice
      ? decodeURIComponent(params.notice)
      : params.confirmed && params.jobs
        ? `Patvirtinta ${params.confirmed}: sukurta ${params.jobs} gamybos darbai.`
        : params.confirmed
          ? `Patvirtinta ${params.confirmed}.`
          : params.rebalanced
            ? `Perskirstyta: perkelta ${params.rebalanced} darb.`
            : params.accepted
              ? "Planas patvirtintas be pakeitimų — staklių apkrova nepasikeitė."
              : params.reopened
                ? "Planas atvertas — galite perskirstyti arba redaguoti."
                : params.moved
                  ? "Perkėlimas išsaugotas (override)."
                  : params.enqueued
                    ? `Į eilę įterpta ${params.enqueued} ${params.enqueued === "1" ? "darbas" : "darbai"} — planas perskaičiuotas.`
                    : params.error
                      ? params.error
                      : null;
  const noticeVariant = params.error ? "error" : "success";

  return (
    <EileQueueLoader
      notice={notice}
      noticeVariant={noticeVariant}
      selectedCode={params.konvejeris}
      confirmed={params.confirmed}
      jobsCreated={params.jobs}
      canEdit={["admin", "pardavimai"].includes(user.role)}
      isAdmin={user.role === "admin"}
      downtimes={downtimes}
    />
  );
}
