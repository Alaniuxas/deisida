import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getNextJobForUser } from "@/lib/queue/service";
import { CechasScreen } from "@/components/production/cechas-screen";

export const dynamic = "force-dynamic";

export default async function CechasPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/prisijungti?next=/cechas");
  if (!["admin", "cechas"].includes(user.role)) {
    redirect("/pasiulymai");
  }

  const initialData = await getNextJobForUser(user.userId);

  return <CechasScreen initialData={initialData} />;
}
