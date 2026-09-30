import { AlertCircle, Inbox, Loader2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { ProductionApiError } from "@/lib/production-types";

interface LoadingStateProps {
  label?: string;
}

export function LoadingState({ label = "Kraunama…" }: LoadingStateProps) {
  return (
    <div
      className="flex min-h-48 flex-col items-center justify-center gap-3 text-muted-foreground"
      role="status"
      aria-live="polite"
    >
      <Loader2 className="size-8 animate-spin text-deisida" aria-hidden />
      <p className="text-base">{label}</p>
    </div>
  );
}

interface EmptyStateProps {
  title: string;
  description?: string;
}

export function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <div
      className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-stone-line bg-card px-6 py-10 text-center"
      role="status"
    >
      <Inbox className="size-10 text-muted-foreground" aria-hidden />
      <p className="text-lg font-medium text-ink">{title}</p>
      {description ? (
        <p className="max-w-sm text-base text-muted-foreground">{description}</p>
      ) : null}
    </div>
  );
}

interface ErrorStateProps {
  error: ProductionApiError | Error;
  onRetry?: () => void;
}

export function ErrorState({ error, onRetry }: ErrorStateProps) {
  const isNotFound =
    error instanceof Error &&
    "kind" in error &&
    (error as ProductionApiError).kind === "not_found";

  return (
    <Alert
      variant={isNotFound ? "default" : "destructive"}
      className="rounded-xl border-stone-line px-4 py-4"
    >
      <AlertCircle className="size-5" />
      <AlertTitle className="text-base">
        {isNotFound ? "Duomenų dar nėra" : "Nepavyko užkrauti"}
      </AlertTitle>
      <AlertDescription className="text-base">
        <p>{error.message}</p>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 inline-flex min-h-11 items-center rounded-lg bg-deisida px-4 text-sm font-medium text-deisida-foreground"
          >
            Bandyti dar kartą
          </button>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
