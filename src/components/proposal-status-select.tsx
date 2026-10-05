"use client";

import { useState } from "react";
import {
  PROPOSAL_STATUS_LABELS,
  PROPOSAL_STATUS_OPTIONS,
  type ProposalStatus,
} from "@/lib/proposal-status";

interface ProposalStatusSelectProps {
  proposalId: string;
  value: ProposalStatus;
  onUpdated: (status: ProposalStatus) => void;
}

export function ProposalStatusSelect({
  proposalId,
  value,
  onUpdated,
}: ProposalStatusSelectProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = async (event: React.ChangeEvent<HTMLSelectElement>) => {
    const next = event.target.value as ProposalStatus;
    if (next === value || pending) return;

    setPending(true);
    setError(null);

    try {
      const response = await fetch(`/api/proposals/${proposalId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Nepavyko pakeisti būsenos.");
      }
      onUpdated(data.proposal.status as ProposalStatus);
    } catch (statusError) {
      setError(
        statusError instanceof Error
          ? statusError.message
          : "Nepavyko pakeisti būsenos.",
      );
      event.target.value = value;
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="min-w-[9.5rem]">
      <select
        value={value}
        onChange={handleChange}
        disabled={pending}
        className="h-9 w-full rounded-md border border-input bg-paper px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
        aria-label="Pasiūlymo būsena"
      >
        {PROPOSAL_STATUS_OPTIONS.map((status) => (
          <option key={status} value={status}>
            {pending && status === value
              ? "Saugoma…"
              : PROPOSAL_STATUS_LABELS[status]}
          </option>
        ))}
      </select>
      {error ? (
        <p className="mt-1 text-xs text-destructive" role="alert">{error}</p>
      ) : null}
    </div>
  );
}
