"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function PrisijungtiPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Nepavyko prisijungti.");
        return;
      }

      const next = searchParams.get("next");
      if (next && next.startsWith("/")) {
        router.push(next);
      } else if (data.user?.role === "cechas") {
        router.push("/cechas");
      } else {
        router.push("/pasiulymai");
      }
      router.refresh();
    } catch {
      setError("Nepavyko prisijungti prie serverio.");
    } finally {
      setLoading(false);
    }
  };

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

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <div className="space-y-2">
            <Label htmlFor="email">El. paštas</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="h-11 bg-paper"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Slaptažodis</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
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
      </div>
    </div>
  );
}
