import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getAssignments, getNextJobForUser } from "@/lib/queue/service";
import { CechasScreen } from "@/components/production/cechas-screen";
import { ConveyorSwitchForm } from "@/components/production/conveyor-switch-form";
import { PageShell } from "@/components/production/page-shell";

export const dynamic = "force-dynamic";

export default async function CechasPage({
  searchParams,
}: {
  searchParams: Promise<{ switched?: string; switchError?: string }>;
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
    name: machine.name,
  }));

  const conveyor = initialData.conveyor;
  const showDeviceSwitch = Boolean(initialData.job && conveyor && machines.length > 0);

  return (
    <PageShell
      title="Cechas"
      subtitle={
        conveyor
          ? `Jūsų konvejeris: ${conveyor.name} (${conveyor.code})`
          : "Kitas darbas jūsų konvejeryje"
      }
    >
      {showDeviceSwitch ? (
        <div className="mb-5">
          <ConveyorSwitchForm
            currentCode={conveyor!.code}
            currentName={conveyor!.name}
            machines={machines}
            switchedCode={params.switched}
            switchError={params.switchError}
          />
        </div>
      ) : null}

      <CechasScreen initialData={initialData} embedded />
    </PageShell>
  );
}
