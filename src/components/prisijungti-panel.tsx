"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { PinLoginForm } from "@/components/pin-login-form";

type LoginMode = "pin" | "email";

export function PrisijungtiPanel() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "";
  const modeParam = searchParams.get("mode");
  const [mode, setMode] = useState<LoginMode>(
    modeParam === "email" ? "email" : "pin",
  );

  useEffect(() => {
    setMode(modeParam === "email" ? "email" : "pin");
  }, [modeParam]);

  if (mode === "email") {
    return (
      <>
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-deisida">
          Deisida
        </p>
        <h1 className="mt-2 text-3xl font-bold text-deisida-muted">Prisijungimas</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Vadovų ir pardavimų prisijungimas
        </p>
        <LoginForm />
        <p className="mt-6 text-center">
          <button
            type="button"
            onClick={() => setMode("pin")}
            className="text-sm text-muted-foreground transition-colors hover:text-deisida"
          >
            Darbuotojo PIN kodas
          </button>
        </p>
      </>
    );
  }

  return (
    <>
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-deisida">
        Deisida
      </p>
      <h1 className="mt-2 text-3xl font-bold text-deisida-muted">Prisijungimas</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Įveskite 4 skaitmenų PIN kodą
      </p>
      <PinLoginForm next={next} />
      <p className="mt-6 text-center">
        <button
          type="button"
          onClick={() => setMode("email")}
          className="text-sm text-muted-foreground transition-colors hover:text-deisida"
        >
          Prisijungimas su el. paštu (vadovams)
        </button>
      </p>
    </>
  );
}
