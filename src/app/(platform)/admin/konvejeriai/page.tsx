import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { KonvejeriaiScreen } from "@/components/production/konvejeriai-screen";
import { resolveKonvejeriaiTab } from "@/lib/konvejeriai-tabs";

export default async function KonvejeriaiPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/prisijungti?next=/admin/konvejeriai");
  if (user.role !== "admin") redirect("/pasiulymai");

  const params = await searchParams;

  return (
    <KonvejeriaiScreen initialTab={resolveKonvejeriaiTab(params.tab)} />
  );
}
