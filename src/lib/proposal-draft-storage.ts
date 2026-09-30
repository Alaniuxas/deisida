import type { Proposal } from "@/lib/types";

const DRAFT_KEY = "deisida:proposal-draft";

export function loadProposalDraft(): Proposal | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Proposal;
  } catch {
    return null;
  }
}

export function saveProposalDraft(proposal: Proposal): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(proposal));
  } catch {
    // Ignore quota / privacy errors.
  }
}

export function clearProposalDraft(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    // Ignore.
  }
}
