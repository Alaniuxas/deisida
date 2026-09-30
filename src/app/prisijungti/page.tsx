import { Suspense } from "react";
import { LoginForm } from "@/components/login-form";

export const dynamic = "force-dynamic";

export default function PrisijungtiPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-2xl border border-stone-line bg-paper p-8 shadow-sm">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-deisida">
          Deisida
        </p>
        <h1 className="mt-2 text-3xl font-bold text-deisida-muted">Prisijungimas</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Plytelių gamybos platforma
        </p>

        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
