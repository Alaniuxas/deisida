import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getAssignments } from "@/lib/queue/service";
import { KonvejeriaiScreen } from "@/components/production/konvejeriai-screen";

export const dynamic = "force-dynamic";

export default async function KonvejeriaiPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/prisijungti?next=/admin/konvejeriai");
  if (user.role !== "admin") redirect("/pasiulymai");

  const initialData = await getAssignments();

  return <KonvejeriaiScreen initialData={initialData} />;
}
