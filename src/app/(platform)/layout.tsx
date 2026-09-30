import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AppNav } from "@/components/app-nav";

export default async function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/prisijungti");
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AppNav user={user} />
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
