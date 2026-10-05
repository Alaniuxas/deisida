"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ProposalListItem } from "@/lib/db/proposals";
import {
  PROPOSAL_STATUS_LABELS,
  PROPOSAL_STATUS_OPTIONS,
  type ProposalStatus,
} from "@/lib/proposal-status";
import { ProposalDeleteButton } from "@/components/proposal-delete-button";
import { ProposalStatusSelect } from "@/components/proposal-status-select";

const PAGE_SIZE = 20;

interface Filters {
  number: string;
  client: string;
  object: string;
  status: ProposalStatus | "";
}

const emptyFilters: Filters = {
  number: "",
  client: "",
  object: "",
  status: "",
};

function filtersAreEmpty(filters: Filters) {
  return (
    !filters.number.trim() &&
    !filters.client.trim() &&
    !filters.object.trim() &&
    !filters.status
  );
}

function buildQuery(filters: Filters, offset: number) {
  const params = new URLSearchParams({
    limit: String(PAGE_SIZE),
    offset: String(offset),
  });
  if (filters.number.trim()) params.set("number", filters.number.trim());
  if (filters.client.trim()) params.set("client", filters.client.trim());
  if (filters.object.trim()) params.set("object", filters.object.trim());
  if (filters.status) params.set("status", filters.status);
  return params.toString();
}

interface ProposalsListProps {
  initialItems?: ProposalListItem[];
  initialHasMore?: boolean;
}

export function ProposalsList({
  initialItems,
  initialHasMore = false,
}: ProposalsListProps) {
  const hasServerInitial = initialItems !== undefined;
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [debouncedFilters, setDebouncedFilters] = useState<Filters>(emptyFilters);
  const [items, setItems] = useState<ProposalListItem[]>(initialItems ?? []);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(!hasServerInitial);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const itemsCountRef = useRef(items.length);
  const fetchLockRef = useRef(false);
  itemsCountRef.current = items.length;

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedFilters(filters), 300);
    return () => window.clearTimeout(timer);
  }, [filters]);

  const fetchPage = useCallback(
    async (offset: number, append: boolean) => {
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      setError(null);

      try {
        const response = await fetch(
          `/api/proposals?${buildQuery(debouncedFilters, offset)}`,
        );
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error ?? "Nepavyko įkelti pasiūlymų.");
        }

        const nextItems = data.items as ProposalListItem[];
        setItems((current) => (append ? [...current, ...nextItems] : nextItems));
        setHasMore(Boolean(data.hasMore));
      } catch (fetchError) {
        setError(
          fetchError instanceof Error
            ? fetchError.message
            : "Nepavyko įkelti pasiūlymų.",
        );
        if (!append) setItems([]);
        setHasMore(false);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [debouncedFilters],
  );

  useEffect(() => {
    if (hasServerInitial && filtersAreEmpty(debouncedFilters)) {
      return;
    }

    fetchPage(0, false);
  }, [debouncedFilters, fetchPage, hasServerInitial]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting || fetchLockRef.current || loadingMore) {
          return;
        }
        fetchLockRef.current = true;
        void fetchPage(itemsCountRef.current, true).finally(() => {
          fetchLockRef.current = false;
        });
      },
      { rootMargin: "120px" },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [fetchPage, hasMore, loadingMore]);

  const updateItemStatus = (id: string, status: ProposalStatus) => {
    setItems((current) =>
      current.map((item) =>
        item.id === id
          ? { ...item, status, updatedAt: new Date().toISOString() }
          : item,
      ),
    );
  };

  const removeItem = (id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-stone-line bg-paper p-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="filter-number">Numeris</Label>
            <Input
              id="filter-number"
              value={filters.number}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  number: event.target.value,
                }))
              }
              placeholder="Pvz. DEI260707"
              className="h-10 bg-paper"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="filter-client">Klientas</Label>
            <Input
              id="filter-client"
              value={filters.client}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  client: event.target.value,
                }))
              }
              placeholder="Kliento pavadinimas"
              className="h-10 bg-paper"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="filter-object">Objektas</Label>
            <Input
              id="filter-object"
              value={filters.object}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  object: event.target.value,
                }))
              }
              placeholder="Objekto pavadinimas"
              className="h-10 bg-paper"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="filter-status">Būsena</Label>
            <Select
              value={filters.status || "all"}
              onValueChange={(value) =>
                setFilters((current) => ({
                  ...current,
                  status: value === "all" ? "" : (value as ProposalStatus),
                }))
              }
            >
              <SelectTrigger id="filter-status" className="h-10 w-full bg-paper">
                <SelectValue>
                  {filters.status
                    ? PROPOSAL_STATUS_LABELS[filters.status]
                    : "Visos būsenos"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Visos būsenos</SelectItem>
                {PROPOSAL_STATUS_OPTIONS.map((status) => (
                  <SelectItem key={status} value={status}>
                    {PROPOSAL_STATUS_LABELS[status]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {loading && items.length === 0 ? (
        <div className="rounded-xl border border-stone-line bg-paper px-6 py-12 text-center text-muted-foreground">
          Kraunama…
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-stone-line px-6 py-12 text-center">
          <p className="text-lg font-medium">Pasiūlymų nerasta</p>
          <p className="mt-2 text-muted-foreground">
            Pakeiskite filtrus arba sukurkite naują pasiūlymą.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-stone-line bg-paper">
          <table className="min-w-[960px] w-full text-left text-sm">
            <thead className="border-b border-stone-line bg-[#f3f3f0]">
              <tr>
                <th className="px-4 py-3 font-semibold">Numeris</th>
                <th className="px-4 py-3 font-semibold">Klientas</th>
                <th className="px-4 py-3 font-semibold">Objektas</th>
                <th className="px-4 py-3 font-semibold">Būsena</th>
                <th className="px-4 py-3 font-semibold">Atnaujinta</th>
                <th className="whitespace-nowrap px-4 py-3 font-semibold text-right">
                  Veiksmai
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((proposal) => (
                <tr
                  key={proposal.id}
                  className="border-b border-stone-line last:border-0"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/pasiulymai/${proposal.id}`}
                      className="font-semibold tracking-tight text-deisida hover:underline"
                    >
                      {proposal.number}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{proposal.clientName}</td>
                  <td className="px-4 py-3">{proposal.object}</td>
                  <td className="px-4 py-3">
                    <ProposalStatusSelect
                      proposalId={proposal.id}
                      value={proposal.status}
                      onUpdated={(status) => updateItemStatus(proposal.id, status)}
                    />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(proposal.updatedAt).toLocaleString("lt-LT")}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-3">
                      {(proposal.status === "confirmed" ||
                        proposal.status === "in_production") && (
                        <Link
                          href={`/pasiulymai/${proposal.id}#eile`}
                          className="text-sm font-medium text-deisida hover:underline"
                        >
                          Valdyti eilę
                        </Link>
                      )}
                      <ProposalDeleteButton
                        id={proposal.id}
                        number={proposal.number}
                        status={proposal.status}
                        onDeleted={() => removeItem(proposal.id)}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div ref={sentinelRef} className="h-1" aria-hidden />
          {loadingMore ? (
            <p className="border-t border-stone-line px-4 py-3 text-center text-sm text-muted-foreground">
              Kraunama daugiau…
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
