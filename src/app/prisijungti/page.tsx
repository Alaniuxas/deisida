import { Suspense } from "react";
import { PrisijungtiPanel } from "@/components/prisijungti-panel";

export const dynamic = "force-dynamic";

export default function PrisijungtiPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-2xl border border-stone-line bg-paper p-8 shadow-sm">
        <Suspense>
          <PrisijungtiPanel />
        </Suspense>
      </div>
    </div>
  );
}
