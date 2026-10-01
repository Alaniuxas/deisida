import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getAssignments, getNextJobForUser } from "@/lib/queue/service";
import { ConveyorSwitchForm } from "@/components/production/conveyor-switch-form";
import { CechasJobPanel } from "@/components/production/cechas-job-panel";
import { EmptyState } from "@/components/production/async-state";
import { PageShell } from "@/components/production/page-shell";
import {
  conveyorDisplayLabel,
  formatPalletRateWithNorm,
} from "@/lib/queue/rate-labels";

export const dynamic = "force-dynamic";

const NOTICES: Record<string, string> = {
  pallet: "Paletė užfiksuota.",
  finished: "Darbas užbaigtas.",
  manager: "Įrašytas signalas vadovui — užbaigta mažiau nei 90 % plano.",
};

const ERRORS: Record<string, string> = {
  reason: "Įrašykite priežastį, kodėl neužbaigėte viso plano.",
  failed: "Nepavyko atlikti veiksmo. Bandykite dar kartą.",
  notfound: "Darbas nerastas.",
};

export default async function CechasPage({
  searchParams,
}: {
  searchParams: Promise<{
    switched?: string;
    switchError?: string;
    notice?: string;
    error?: string;
  }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/prisijungti?next=/cechas");
  if (!["admin", "cechas"].includes(user.role)) {
    redirect("/pasiulymai");
  }

  const params = await searchParams;
  const [initialData, assignments] = await Promise.all([
    getNextJobForUser(user.userId),
    getAssignments(),
  ]);

  const machines = assignments.machines.map((machine) => ({
    id: machine.id,
    code: machine.code,
    shopCode: machine.shopCode,
    name: machine.name,
  }));

  const conveyor = initialData.conveyor;
  const job = initialData.job;
  const notice = params.notice ? NOTICES[params.notice] : undefined;
  const error = params.error ? ERRORS[params.error] : undefined;

  return (
    <PageShell
      title="Cechas"
      subtitle={
        conveyor
          ? `Jūsų konvejeris: ${conveyorDisplayLabel(conveyor.code, conveyor.name)} · Našumas (eilėje): ${formatPalletRateWithNorm(conveyor.dailyRatePallets ?? 0, conveyor.workNormPiecesPerDay)}`
          : "Kitas darbas jūsų konvejeryje"
      }
    >
      {conveyor && machines.length > 0 ? (
        <div className="mb-5">
          <ConveyorSwitchForm
            currentCode={conveyor.code}
            currentShopCode={conveyor.shopCode}
            currentName={conveyor.name}
            machines={machines}
            switchedCode={params.switched}
            switchError={params.switchError}
          />
        </div>
      ) : null}

      {job ? (
        <CechasJobPanel job={job} notice={notice} error={error} />
      ) : (
        <EmptyState
          title="Šiuo metu darbų nėra"
          description="Sistema parodys artimiausią darbą jūsų įrenginyje, kai jis bus eilėje."
        />
      )}
    </PageShell>
  );
}
