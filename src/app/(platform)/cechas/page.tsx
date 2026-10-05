import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  getAssignments,
  getLaneJobsForUser,
  getNextJobForUser,
} from "@/lib/queue/service";
import { ConveyorSwitchForm } from "@/components/production/conveyor-switch-form";
import { CechasJobPanel } from "@/components/production/cechas-job-panel";
import { CechasViewShell } from "@/components/production/cechas-view-shell";
import { EmptyState } from "@/components/production/async-state";
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
  comment: "Jei padaryta mažiau nei 90 % normos, įrašykite komentarą.",
  quantity: "Įveskite padarytą kiekį (vnt.).",
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
  const isAdmin = user.role === "admin";

  const [initialData, laneData, assignments] = await Promise.all([
    getNextJobForUser(user.userId),
    getLaneJobsForUser(user.userId),
    isAdmin ? getAssignments() : Promise.resolve(null),
  ]);

  const conveyor = initialData.conveyor ?? laneData.conveyor;
  const job = initialData.job;
  const notice = params.notice ? NOTICES[params.notice] : undefined;
  const error = params.error ? ERRORS[params.error] : undefined;

  const machines = assignments?.machines.map((machine) => ({
    id: machine.id,
    code: machine.code,
    shopCode: machine.shopCode,
    name: machine.name,
  })) ?? [];

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col bg-background">
      <header className="border-b border-stone-line bg-paper px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-xl font-semibold text-ink sm:text-2xl">Cechas</h1>
            {conveyor ? (
              <p className="text-sm text-muted-foreground">
                {conveyorDisplayLabel(conveyor.code, conveyor.name)}
                {" · "}
                Našumas: {formatPalletRateWithNorm(
                  conveyor.dailyRatePallets ?? 0,
                  conveyor.workNormPiecesPerDay,
                )}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Konvejeris nepriskirtas — kreipkitės į vadovą
              </p>
            )}
          </div>
          {conveyor ? (
            <div className="rounded-xl bg-deisida/10 px-4 py-2 text-center">
              <p className="text-xs text-muted-foreground">Jūsų staklė</p>
              <p className="text-lg font-bold text-deisida">
                {conveyor.shopCode || conveyor.code}
              </p>
            </div>
          ) : null}
        </div>
      </header>

      <main className="flex-1 px-4 py-4 sm:px-6 lg:px-8">
        {isAdmin && conveyor && machines.length > 0 ? (
          <div className="mb-4">
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

        <CechasViewShell
          jobs={laneData.jobs}
          currentJobId={job?.id}
          lockedWeekStart={laneData.lockedWeekStart}
          lockedWeekEnd={laneData.lockedWeekEnd}
          conveyorShopCode={conveyor?.shopCode}
        >
          {job ? (
            <CechasJobPanel job={job} notice={notice} error={error} />
          ) : (
            <EmptyState
              title="Šiuo metu darbų nėra"
              description="Sistema parodys artimiausią darbą jūsų įrenginyje, kai jis bus eilėje."
            />
          )}
        </CechasViewShell>
      </main>
    </div>
  );
}
