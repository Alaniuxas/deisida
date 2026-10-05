"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import type { Proposal } from "@/lib/types";
import { ClientProposalPreview } from "@/components/client-proposal-preview";
import { ProductionProposalPreview } from "@/components/production-proposal-preview";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type PreviewDoc = "client" | "production";

interface ProposalPreviewOverlayProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  proposal: Proposal;
  previewDoc: PreviewDoc;
  onPreviewDocChange: (doc: PreviewDoc) => void;
  loading?: boolean;
  error?: string | null;
}

export function ProposalPreviewOverlay({
  open,
  onOpenChange,
  proposal,
  previewDoc,
  onPreviewDocChange,
  loading = false,
  error = null,
}: ProposalPreviewOverlayProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/55 p-4 sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-label="Pasiūlymo peržiūra"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="relative my-auto w-full max-w-4xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="overflow-hidden rounded-xl bg-[#f3f3f0] shadow-2xl">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-line px-5 py-4 sm:px-6">
            <h2 className="text-lg font-semibold text-deisida-muted">Peržiūra</h2>
            <div className="flex items-center gap-2">
              <Tabs
                value={previewDoc}
                onValueChange={(value) => onPreviewDocChange(value as PreviewDoc)}
              >
                <TabsList className="h-10">
                  <TabsTrigger value="client">Klientui</TabsTrigger>
                  <TabsTrigger value="production">Gamyba</TabsTrigger>
                </TabsList>
              </Tabs>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-10 shrink-0"
                onClick={() => onOpenChange(false)}
                aria-label="Uždaryti peržiūrą"
              >
                <X className="size-5" />
              </Button>
            </div>
          </div>
          <div className="max-h-[calc(100dvh-5rem)] overflow-y-auto p-5 sm:p-8">
            {previewDoc === "client" ? (
              <ClientProposalPreview
                proposal={proposal}
                loading={loading}
                error={error}
                narrow={false}
              />
            ) : (
              <ProductionProposalPreview
                proposal={proposal}
                loading={loading}
                error={error}
                compact={false}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
