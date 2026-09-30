import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getScheduledQueue } from "@/lib/queue/service";
import { EileScreen } from "@/components/production/eile-screen";

export const dynamic = "force-dynamic";

export default async function EilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/prisijungti?next=/eile");
  if (!["admin", "pardavimai", "cechas"].includes(user.role)) {
    redirect("/pasiulymai");
  }

  const initialData = await getScheduledQueue();

  return <EileScreen initialData={initialData} />;
}
