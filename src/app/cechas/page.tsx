import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getAssignments, getNextJobForUser } from "@/lib/queue/service";
import { CechasScreen } from "@/components/production/cechas-screen";

export const dynamic = "force-dynamic";

export default async function CechasPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/prisijungti?next=/cechas");
  if (!["admin", "cechas"].includes(user.role)) {
    redirect("/pasiulymai");
  }

  const [initialData, assignments] = await Promise.all([
    getNextJobForUser(user.userId),
    getAssignments(),
  ]);

  const machines = assignments.machines.map((machine) => ({
    id: machine.id,
    code: machine.code,
    name: machine.name,
  }));

  return <CechasScreen initialData={initialData} machines={machines} />;
}
