"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const errorMessages: Record<string, string> = {
  empty: "Įveskite PIN kodą.",
  invalid: "Neteisingas PIN kodas.",
  failed: "Nepavyko prisijungti. Bandykite dar kartą.",
};

interface PinLoginFormProps {
  next?: string;
  submitLabel?: string;
}

export function PinLoginForm({
  next = "",
  submitLabel = "Prisijungti",
}: PinLoginFormProps) {
  const searchParams = useSearchParams();
  const queryError = searchParams.get("error");
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
      const response = await fetch("/api/auth/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pin: formData.get("pin"),
          next: next || undefined,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        setClientError(data.error ?? "Nepavyko prisijungti.");
        return;
      }

      const redirectTo =
        next && next.startsWith("/") ? next : "/cechas";
      window.location.href = redirectTo;
    } catch {
      event.currentTarget.submit();
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      action="/api/auth/pin"
      method="post"
      onSubmit={handleSubmit}
      className="mt-8 space-y-5"
    >
      {next ? <input type="hidden" name="next" value={next} /> : null}

      <div className="space-y-2">
        <Label htmlFor="pin">PIN kodas</Label>
        <Input
          id="pin"
          name="pin"
          type="password"
          inputMode="numeric"
          pattern="\d{4}"
          minLength={4}
          maxLength={4}
          autoComplete="one-time-code"
          className="h-14 bg-paper text-center text-2xl tracking-[0.4em]"
          placeholder="••••"
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
        className="h-12 w-full bg-deisida text-deisida-foreground hover:bg-deisida/90"
      >
        {loading ? "Jungiamasi…" : submitLabel}
      </Button>
    </form>
  );
}
