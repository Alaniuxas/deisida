import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getScheduledQueue } from "@/lib/queue/service";
import { EileQueueView } from "@/components/production/eile-queue-view";

export const dynamic = "force-dynamic";

export default async function EilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/prisijungti?next=/eile");
  if (!["admin", "pardavimai", "cechas"].includes(user.role)) {
    redirect("/pasiulymai");
  }

  const queue = await getScheduledQueue();

  return <EileQueueView data={queue} />;
}
