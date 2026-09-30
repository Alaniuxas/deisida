"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { loginAction } from "@/app/prisijungti/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const errorMessages: Record<string, string> = {
  empty: "Įveskite el. paštą ir slaptažodį.",
  invalid: "Neteisingi prisijungimo duomenys.",
};

export function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "";
  const queryError = searchParams.get("error");
  const prefilledEmail = searchParams.get("email") ?? "";
  const [clientError, setClientError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const error =
    clientError ??
    (queryError ? errorMessages[queryError] ?? "Nepavyko prisijungti." : null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setClientError(null);

    try {
      const formData = new FormData(event.currentTarget);
      await loginAction(formData);
    } catch {
      setClientError("Nepavyko prisijungti prie serverio.");
      setLoading(false);
    }
  };

  return (
    <form
      action={loginAction}
      method="post"
      onSubmit={handleSubmit}
      className="mt-8 space-y-5"
    >
      {next ? <input type="hidden" name="next" value={next} /> : null}

      <div className="space-y-2">
        <Label htmlFor="email">El. paštas</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={prefilledEmail}
          className="h-11 bg-paper"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Slaptažodis</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          className="h-11 bg-paper"
          required
        />
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Klaida</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Button
        type="submit"
        disabled={loading}
        className="h-11 w-full bg-deisida text-deisida-foreground hover:bg-deisida/90"
      >
        {loading ? "Jungiamasi…" : "Prisijungti"}
      </Button>
    </form>
  );
}
