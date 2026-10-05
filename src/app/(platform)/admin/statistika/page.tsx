import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { StatisticsScreen } from "@/components/production/statistics-screen";

export default async function StatistikaPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/prisijungti?next=/admin/statistika");
  if (user.role !== "admin") redirect("/pasiulymai");

  return <StatisticsScreen />;
}
