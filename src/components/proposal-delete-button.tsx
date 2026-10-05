"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";

interface ProposalDeleteButtonProps {
  id: string;
  number: string;
  status: string;
  onDeleted?: () => void;
}

export function ProposalDeleteButton({
  id,
  number,
  status,
  onDeleted,
}: ProposalDeleteButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasProductionJobs =
    status === "confirmed" || status === "in_production";

  async function handleDelete() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/proposals/${id}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Nepavyko ištrinti pasiūlymo.");
      }
      setOpen(false);
      onDeleted?.();
      router.refresh();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Nepavyko ištrinti pasiūlymo.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        type="button"
        className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
        aria-label={`Ištrinti pasiūlymą ${number}`}
      >
        <Trash2 className="size-4" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <PopoverTitle>Ištrinti pasiūlymą?</PopoverTitle>
        <PopoverDescription className="mt-1">
          Pasiūlymas <span className="font-medium text-foreground">{number}</span>{" "}
          bus visam laikui pašalintas iš duomenų bazės.
          {hasProductionJobs
            ? " Kartu bus ištrinti ir susiję gamybos darbai bei eilės plano įrašai."
            : null}
        </PopoverDescription>
        {error ? (
          <p className="text-sm text-destructive" role="alert">{error}</p>
        ) : null}
        <div className="mt-2 flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            Atšaukti
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={handleDelete}
            disabled={pending}
          >
            {pending ? "Trinama…" : "Ištrinti"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
