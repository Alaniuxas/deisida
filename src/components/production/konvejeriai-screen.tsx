"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/production/async-state";
import { PageShell } from "@/components/production/page-shell";
import {
  fetchAssignments,
  patchMachine,
  saveAssignments,
} from "@/lib/production-api";
import type {
  Machine,
  MachineCode,
  Person,
  ProductionApiError,
} from "@/lib/production-types";

const MACHINE_ORDER: MachineCode[] = ["KONV", "KNEW"];

export function KonvejeriaiScreen() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ProductionApiError | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [draftAssignments, setDraftAssignments] = useState<
    Record<string, string[]>
  >({});
  const [machineDrafts, setMachineDrafts] = useState<
    Record<string, { dailyRatePallets: string; rotationHours: string; currentWidthMm: string }>
  >({});
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const applyData = useCallback((data: { people: Person[]; machines: Machine[] }) => {
    setPeople(data.people);
    const sorted = [...data.machines].sort(
      (a, b) =>
        MACHINE_ORDER.indexOf(a.code) - MACHINE_ORDER.indexOf(b.code),
    );
    setMachines(sorted);
    const assignments: Record<string, string[]> = {};
    const drafts: Record<
      string,
      { dailyRatePallets: string; rotationHours: string; currentWidthMm: string }
    > = {};
    for (const machine of sorted) {
      assignments[machine.id] = [...machine.assignedPersonIds];
      drafts[machine.id] = {
        dailyRatePallets: String(machine.dailyRatePallets),
        rotationHours: String(machine.rotationHours),
        currentWidthMm: String(machine.currentWidthMm),
      };
    }
    setDraftAssignments(assignments);
    setMachineDrafts(drafts);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSaveMessage(null);
    try {
      const data = await fetchAssignments();
      applyData(data);
    } catch (err) {
      setPeople([]);
      setMachines([]);
      setError(err as ProductionApiError);
    } finally {
      setLoading(false);
    }
  }, [applyData]);

  useEffect(() => {
    let active = true;

    fetchAssignments()
      .then((data) => {
        if (!active) return;
        applyData(data);
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        setPeople([]);
        setMachines([]);
        setError(err as ProductionApiError);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [applyData]);

  const unassignedPeople = useMemo(() => {
    const assigned = new Set(
      Object.values(draftAssignments).flatMap((ids) => ids),
    );
    return people.filter((person) => !assigned.has(person.id));
  }, [people, draftAssignments]);

  const togglePerson = (machineId: string, personId: string) => {
    setDraftAssignments((prev) => {
      const current = prev[machineId] ?? [];
      const isAssigned = current.includes(personId);
      const next = { ...prev };

      for (const id of Object.keys(next)) {
        next[id] = next[id].filter((pid) => pid !== personId);
      }

      if (!isAssigned) {
        next[machineId] = [...(next[machineId] ?? []), personId];
      }

      return next;
    });
    setSaveMessage(null);
    setSaveError(null);
  };

  const updateMachineDraft = (
    machineId: string,
    field: "dailyRatePallets" | "rotationHours" | "currentWidthMm",
    value: string,
  ) => {
    setMachineDrafts((prev) => ({
      ...prev,
      [machineId]: {
        ...prev[machineId],
        [field]: value,
      },
    }));
    setSaveMessage(null);
    setSaveError(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    setSaveMessage(null);

    try {
      const assignments = Object.entries(draftAssignments).flatMap(
        ([machineId, personIds]) =>
          personIds.map((personId) => ({ machineId, personId })),
      );

      let latest = await saveAssignments({ assignments });

      for (const machine of latest.machines) {
        const draft = machineDrafts[machine.id];
        if (!draft) continue;

        const patch = {
          dailyRatePallets: Number(draft.dailyRatePallets),
          rotationHours: Number(draft.rotationHours),
          currentWidthMm: Number(draft.currentWidthMm),
        };

        if (
          patch.dailyRatePallets !== machine.dailyRatePallets ||
          patch.rotationHours !== machine.rotationHours ||
          patch.currentWidthMm !== machine.currentWidthMm
        ) {
          latest = await patchMachine(machine.id, patch);
        }
      }

      applyData(latest);
      setSaveMessage("Išsaugota.");
    } catch (err) {
      const apiErr = err as ProductionApiError;
      setSaveError(
        apiErr.kind === "not_found"
          ? "Išsaugojimas dar neveikia — API nepasiekiama."
          : apiErr.message,
      );
    } finally {
      setSaving(false);
    }
  };

  const showEmptyMachines =
    !loading && error?.kind === "not_found" && machines.length === 0;

  const displayMachines =
    machines.length > 0
      ? machines
      : MACHINE_ORDER.map((code) => ({
          id: `placeholder-${code}`,
          code,
          name: code === "KONV" ? "Konvejeris" : "Naujas konvejeris",
          dailyRatePallets: 0,
          rotationHours: 8,
          currentWidthMm: 0,
          assignedPersonIds: [],
        }));

  return (
    <PageShell
      title="Konvejeriai"
      subtitle="Priskirkite žmones ir koreguokite našumą"
      wide
    >
      {loading ? <LoadingState label="Kraunami konvejeriai…" /> : null}

      {!loading && error && machines.length === 0 ? (
        <div className="mb-6">
          <ErrorState error={error} onRetry={load} />
        </div>
      ) : null}

      {!loading && (machines.length > 0 || showEmptyMachines) ? (
        <div className="space-y-6">
          {saveMessage ? (
            <Alert className="rounded-xl border-deisida/30 bg-deisida/5 px-4 py-4">
              <Check className="size-5 text-deisida" />
              <AlertTitle className="text-base text-deisida">
                {saveMessage}
              </AlertTitle>
            </Alert>
          ) : null}

          {saveError ? (
            <Alert variant="destructive" className="rounded-xl px-4 py-4">
              <AlertTitle className="text-base">Nepavyko išsaugoti</AlertTitle>
              <AlertDescription className="text-base">
                {saveError}
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="grid gap-6 lg:grid-cols-2">
            {displayMachines.map((machine) => {
              const draft = machineDrafts[machine.id] ?? {
                dailyRatePallets: String(machine.dailyRatePallets),
                rotationHours: String(machine.rotationHours),
                currentWidthMm: String(machine.currentWidthMm),
              };
              const assignedIds = draftAssignments[machine.id] ?? [];

              return (
                <Card
                  key={machine.id}
                  className="paper-shadow rounded-2xl border-stone-line"
                >
                  <CardHeader className="border-b border-stone-line pb-4">
                    <CardTitle className="flex items-center gap-2 text-xl">
                      <span className="rounded-lg bg-deisida px-2.5 py-1 text-sm font-bold text-deisida-foreground">
                        {machine.code}
                      </span>
                      {machine.name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-5 pt-5">
                    <div>
                      <div className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                        <Users className="size-4" />
                        Šiandien dirba
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {people.length === 0 ? (
                          <p className="text-base text-muted-foreground">
                            Darbuotojų sąrašas tuščias
                          </p>
                        ) : (
                          people.map((person) => {
                            const selected = assignedIds.includes(person.id);
                            return (
                              <button
                                key={person.id}
                                type="button"
                                onClick={() =>
                                  togglePerson(machine.id, person.id)
                                }
                                disabled={showEmptyMachines}
                                className={`min-h-12 rounded-xl px-4 text-base font-medium transition-colors ${
                                  selected
                                    ? "bg-deisida text-deisida-foreground"
                                    : "bg-muted text-foreground hover:bg-muted/80"
                                }`}
                              >
                                {person.name}
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-3">
                      <Field
                        id={`rate-${machine.id}`}
                        label="Paletės per dieną"
                        value={draft.dailyRatePallets}
                        onChange={(value) =>
                          updateMachineDraft(
                            machine.id,
                            "dailyRatePallets",
                            value,
                          )
                        }
                        disabled={showEmptyMachines}
                      />
                      <Field
                        id={`rotation-${machine.id}`}
                        label="Rotacija (val.)"
                        value={draft.rotationHours}
                        onChange={(value) =>
                          updateMachineDraft(machine.id, "rotationHours", value)
                        }
                        disabled={showEmptyMachines}
                      />
                      <Field
                        id={`width-${machine.id}`}
                        label="Dabartinis plotis (mm)"
                        value={draft.currentWidthMm}
                        onChange={(value) =>
                          updateMachineDraft(
                            machine.id,
                            "currentWidthMm",
                            value,
                          )
                        }
                        disabled={showEmptyMachines}
                      />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {people.length > 0 && unassignedPeople.length > 0 ? (
            <p className="text-base text-muted-foreground">
              Nepriskirti:{" "}
              {unassignedPeople.map((person) => person.name).join(", ")}
            </p>
          ) : null}

          <Button
            type="button"
            onClick={handleSave}
            disabled={saving || showEmptyMachines}
            className="h-14 w-full rounded-2xl bg-deisida text-base font-semibold text-deisida-foreground hover:bg-deisida/90 sm:w-auto sm:min-w-48"
          >
            {saving ? "Saugoma…" : "Išsaugoti"}
          </Button>
        </div>
      ) : null}

      {!loading && !error && machines.length === 0 && !showEmptyMachines ? (
        <EmptyState
          title="Konvejerių duomenų nėra"
          description="Kai API bus paruošta, čia matysite KONV ir KNEW."
        />
      ) : null}
    </PageShell>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-sm text-muted-foreground">
        {label}
      </Label>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="h-12 text-base"
      />
    </div>
  );
}
