"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Loader2, Minus, Plus } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ShopJob } from "@/lib/production-types";

const QUICK_AMOUNTS = [50, 100, 200, 240, 500] as const;

const FINISH_REASON_PRESETS = [
  "Trūko medžiagos",
  "Sugadinta paletė / brokas",
  "Įranga sustojo",
  "Klaidingas užsakymas",
  "Kita",
] as const;

interface CechasQuickInputProps {
  job: ShopJob;
}

export function CechasQuickInput({ job }: CechasQuickInputProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [quantity, setQuantity] = useState("");
  const [defect, setDefect] = useState("0");
  const [comment, setComment] = useState("");
  const [showDefect, setShowDefect] = useState(true);
  const [showFinish, setShowFinish] = useState(false);
  const [finishPreset, setFinishPreset] = useState("");
  const [finishReason, setFinishReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const underPlan = job.quantityLogged < job.quantityPlanned;
  const parsedQty = parseInt(quantity, 10) || 0;

  const addAmount = useCallback((amount: number) => {
    setQuantity((prev) => {
      const current = parseInt(prev, 10) || 0;
      return String(current + amount);
    });
    inputRef.current?.focus();
  }, []);

  const handleSavePallet = useCallback(() => {
    if (parsedQty <= 0) {
      setError("Įveskite padarytą kiekį.");
      return;
    }
    setError(null);

    startTransition(async () => {
      try {
        const response = await fetch(`/api/jobs/${job.id}/pallet`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            goodQuantity: parsedQty,
            defectQuantity: parseInt(defect, 10) || 0,
            comment: comment.trim() || undefined,
          }),
        });

        if (!response.ok) {
          const data = await response.json().catch(() => null);
          setError(data?.error ?? "Nepavyko išsaugoti.");
          return;
        }

        setQuantity("");
        setDefect("0");
        setComment("");
        router.refresh();
      } catch {
        setError("Nepavyko išsaugoti. Bandykite dar kartą.");
      }
    });
  }, [parsedQty, defect, comment, job.id, router]);

  const handleFinish = useCallback(() => {
    if (job.quantityLogged === 0 && parsedQty <= 0) {
      setError("Pirmiausia užfiksuokite bent vieną paletę.");
      return;
    }
    if (underPlan && !finishPreset) {
      setError("Pasirinkite priežastį.");
      return;
    }
    setError(null);

    startTransition(async () => {
      try {
        const response = await fetch(`/api/jobs/${job.id}/finish`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reasonPreset: finishPreset,
            reason: finishReason.trim() || undefined,
          }),
        });

        if (!response.ok) {
          const data = await response.json().catch(() => null);
          setError(data?.error ?? "Nepavyko užbaigti.");
          return;
        }

        setShowFinish(false);
        router.refresh();
      } catch {
        setError("Nepavyko užbaigti. Bandykite dar kartą.");
      }
    });
  }, [job.id, job.quantityLogged, parsedQty, underPlan, finishPreset, finishReason, router]);

  return (
    <div className="space-y-4">
      {error ? (
        <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="rounded-2xl border-2 border-deisida/30 bg-deisida/5 p-4">
        <p className="mb-3 text-sm font-medium text-muted-foreground">
          Kiek supjovėte (vnt.)
        </p>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => addAmount(-50)}
            className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-stone-line bg-paper text-lg hover:bg-muted/60"
            aria-label="Atimti 50"
          >
            <Minus className="size-5" />
          </button>

          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder="0"
            className="h-16 min-w-0 flex-1 rounded-xl border-2 border-stone-line bg-paper text-center text-4xl font-semibold tabular-nums outline-none focus:border-deisida"
          />

          <button
            type="button"
            onClick={() => addAmount(50)}
            className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-stone-line bg-paper text-lg hover:bg-muted/60"
            aria-label="Pridėti 50"
          >
            <Plus className="size-5" />
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {QUICK_AMOUNTS.map((amount) => (
            <button
              key={amount}
              type="button"
              onClick={() => addAmount(amount)}
              className="rounded-lg border border-stone-line bg-paper px-3 py-2 text-sm font-medium tabular-nums hover:bg-muted/60"
            >
              +{amount}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setQuantity("")}
            className="rounded-lg border border-stone-line bg-paper px-3 py-2 text-sm text-muted-foreground hover:bg-muted/60"
          >
            Išvalyti
          </button>
        </div>

        <button
          type="button"
          onClick={handleSavePallet}
          disabled={isPending || parsedQty <= 0 || job.remaining <= 0}
          className="mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-deisida text-lg font-semibold text-deisida-foreground hover:bg-deisida/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? (
            <Loader2 className="size-5 animate-spin" />
          ) : (
            <Check className="size-5" />
          )}
          Išsaugoti ({parsedQty > 0 ? parsedQty : "—"} vnt.)
        </button>
      </div>

      <button
        type="button"
        onClick={() => setShowDefect((v) => !v)}
        className="flex w-full items-center gap-2 text-sm text-muted-foreground hover:text-ink"
      >
        <ChevronDown
          className={`size-4 transition-transform ${showDefect ? "rotate-180" : ""}`}
        />
        {showDefect ? "Slėpti broką" : "Brokas ar komentaras"}
      </button>

      {showDefect ? (
        <div className="space-y-3 rounded-xl border border-stone-line bg-muted/20 p-4">
          <div className="space-y-1">
            <Label htmlFor="defect-qty" className="text-sm">Brokas vnt.</Label>
            <input
              id="defect-qty"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={defect}
              onChange={(e) => setDefect(e.target.value.replace(/[^0-9]/g, ""))}
              className="h-10 w-full rounded-lg border border-stone-line bg-paper px-3 text-base tabular-nums"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="pallet-comment" className="text-sm">
              Komentaras (jei &lt;90 % normos)
            </Label>
            <Textarea
              id="pallet-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Pvz.: lėtesnis tempas…"
              className="min-h-16 text-sm"
            />
          </div>
        </div>
      ) : null}

      <div className="border-t border-stone-line pt-4">
        {!showFinish ? (
          <button
            type="button"
            onClick={() => setShowFinish(true)}
            disabled={job.quantityLogged === 0}
            className="flex h-12 w-full items-center justify-center rounded-xl border border-stone-line bg-paper text-base font-medium hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Baigiau darbą
          </button>
        ) : (
          <div className="space-y-3 rounded-xl border border-stone-line bg-muted/20 p-4">
            <p className="text-sm font-medium">Užbaigti darbą</p>
            <p className="text-xs text-muted-foreground">
              {underPlan
                ? "Neužbaigus viso plano — pasirinkite priežastį. Mažiau nei 90 % — signalas vadovui."
                : "Priežastis neprivaloma, jei planas įvykdytas."}
            </p>
            <div className="space-y-1">
              <Label htmlFor="finish-preset" className="text-sm">
                Priežastis {underPlan ? "(privaloma)" : ""}
              </Label>
              <select
                id="finish-preset"
                value={finishPreset}
                onChange={(e) => setFinishPreset(e.target.value)}
                className="h-10 w-full rounded-lg border border-stone-line bg-paper px-3 text-sm"
              >
                <option value="">Pasirinkite…</option>
                {FINISH_REASON_PRESETS.map((preset) => (
                  <option key={preset} value={preset}>{preset}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="finish-reason" className="text-sm">
                Papildoma informacija
              </Label>
              <Textarea
                id="finish-reason"
                value={finishReason}
                onChange={(e) => setFinishReason(e.target.value)}
                placeholder="Pvz.: trūko 2 palečių…"
                className="min-h-16 text-sm"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowFinish(false)}
                className="flex h-11 flex-1 items-center justify-center rounded-xl border border-stone-line text-sm hover:bg-muted/60"
              >
                Atšaukti
              </button>
              <button
                type="button"
                onClick={handleFinish}
                disabled={isPending}
                className="flex h-11 flex-1 items-center justify-center rounded-xl bg-ink text-sm font-medium text-paper hover:bg-ink/90 disabled:opacity-50"
              >
                {isPending ? <Loader2 className="size-4 animate-spin" /> : "Patvirtinti"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
