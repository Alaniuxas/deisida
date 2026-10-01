"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { lt } from "date-fns/locale";
import {
  CalendarRange,
  Check,
  History,
  UserCheck,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LithuanianDatePicker } from "@/components/lithuanian-date-picker";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/production/async-state";
import { PageShell } from "@/components/production/page-shell";
import {
  createRotationPeriod,
  fetchAssignments,
  patchMachine,
  reassignRotation,
  saveAssignments,
} from "@/lib/production-api";
import { formatIsoDateLocal } from "@/lib/proposal-utils";
import type {
  AssignmentsResponse,
  Machine,
  MachineCode,
  Person,
  ProductionApiError,
  RotationHistoryEntry,
  RotationsAdminData,
} from "@/lib/production-types";

const MACHINE_ORDER: MachineCode[] = ["KONV", "KNEW"];

function buildDraftState(data: AssignmentsResponse) {
  const sorted = [...data.machines].sort(
    (a, b) => MACHINE_ORDER.indexOf(a.code) - MACHINE_ORDER.indexOf(b.code),
  );
  const assignments: Record<string, string[]> = {};
  const drafts: Record<
    string,
    {
      shopCode: string;
      dailyRatePallets: string;
      rotationHours: string;
      currentWidthMm: string;
    }
  > = {};
  for (const machine of sorted) {
    assignments[machine.id] = [...machine.assignedPersonIds];
    drafts[machine.id] = {
      shopCode: machine.shopCode,
      dailyRatePallets: String(machine.dailyRatePallets),
      rotationHours: String(machine.rotationHours),
      currentWidthMm: String(machine.currentWidthMm),
    };
  }
  return { sorted, assignments, drafts };
}

function defaultPeriodEnd(startIso: string): string {
  const start = new Date(
    Number(startIso.slice(0, 4)),
    Number(startIso.slice(5, 7)) - 1,
    Number(startIso.slice(8, 10)),
  );
  const day = start.getDay();
  const daysUntilFriday = day <= 5 ? 5 - day : 7 - day + 5;
  const add = daysUntilFriday === 0 ? 7 : daysUntilFriday;
  const end = new Date(start);
  end.setDate(end.getDate() + add);
  return formatIsoDateLocal(end);
}

function formatLtDate(iso: string): string {
  try {
    const date = new Date(
      Number(iso.slice(0, 4)),
      Number(iso.slice(5, 7)) - 1,
      Number(iso.slice(8, 10)),
    );
    return format(date, "yyyy-MM-dd", { locale: lt });
  } catch {
    return iso;
  }
}

interface KonvejeriaiScreenProps {
  initialData?: AssignmentsResponse;
}

export function KonvejeriaiScreen({ initialData }: KonvejeriaiScreenProps) {
  const initialDrafts = initialData ? buildDraftState(initialData) : null;
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState<ProductionApiError | null>(null);
  const [people, setPeople] = useState<Person[]>(initialData?.people ?? []);
  const [machines, setMachines] = useState<Machine[]>(
    initialDrafts?.sorted ?? [],
  );
  const [rotations, setRotations] = useState<RotationsAdminData | null>(
    initialData?.rotations ?? null,
  );
  const [draftAssignments, setDraftAssignments] = useState<
    Record<string, string[]>
  >(initialDrafts?.assignments ?? {});
  const [machineDrafts, setMachineDrafts] = useState<
    Record<
      string,
      {
        shopCode: string;
        dailyRatePallets: string;
        rotationHours: string;
        currentWidthMm: string;
      }
    >
  >(initialDrafts?.drafts ?? {});
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [periodStart, setPeriodStart] = useState(formatIsoDateLocal(new Date()));
  const [periodEnd, setPeriodEnd] = useState(() =>
    defaultPeriodEnd(formatIsoDateLocal(new Date())),
  );
  const [periodNote, setPeriodNote] = useState("");
  const [creatingPeriod, setCreatingPeriod] = useState(false);

  const handlePeriodStartChange = (value: string) => {
    setPeriodStart(value);
    setPeriodEnd(defaultPeriodEnd(value));
  };

  const [pendingReassign, setPendingReassign] = useState<{
    machineId: string;
    personId: string;
    isAssigned: boolean;
  } | null>(null);
  const [reassignReason, setReassignReason] = useState("");

  const applyData = useCallback((data: AssignmentsResponse) => {
    setPeople(data.people);
    const { sorted, assignments, drafts } = buildDraftState(data);
    setMachines(sorted);
    setDraftAssignments(assignments);
    setMachineDrafts(drafts);
    setRotations(data.rotations ?? null);
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
    if (initialData) return;
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
  }, [applyData, initialData]);


  const activePeriod = rotations?.activePeriod ?? null;
  const useRotationMode = Boolean(activePeriod);

  const personMachineCode = useMemo(() => {
    const map = new Map<string, MachineCode>();
    for (const machine of machines) {
      for (const personId of draftAssignments[machine.id] ?? []) {
        map.set(personId, machine.code);
      }
    }
    return map;
  }, [machines, draftAssignments]);

  const unassignedPeople = useMemo(() => {
    const assigned = new Set(
      Object.values(draftAssignments).flatMap((ids) => ids),
    );
    return people.filter((person) => !assigned.has(person.id));
  }, [people, draftAssignments]);

  const applyLocalAssignment = (machineId: string, personId: string) => {
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

  const togglePerson = async (machineId: string, personId: string) => {
    const current = draftAssignments[machineId] ?? [];
    const isAssigned = current.includes(personId);

    if (useRotationMode && activePeriod) {
      setPendingReassign({ machineId, personId, isAssigned });
      setReassignReason("");
      return;
    }

    applyLocalAssignment(machineId, personId);
  };

  const confirmReassign = async () => {
    if (!pendingReassign || !activePeriod) return;
    setSaving(true);
    setSaveError(null);
    try {
      const targetMachineId = pendingReassign.isAssigned
        ? null
        : pendingReassign.machineId;

      const updated = await reassignRotation({
        periodId: activePeriod.id,
        personId: pendingReassign.personId,
        machineId: targetMachineId,
        reason: reassignReason,
      });

      setRotations(updated);
      const data = await fetchAssignments();
      applyData(data);
      setSaveMessage("Perkėlimas išsaugotas.");
      setPendingReassign(null);
      setReassignReason("");
    } catch (err) {
      const apiErr = err as ProductionApiError;
      setSaveError(apiErr.message);
    } finally {
      setSaving(false);
    }
  };

  const updateMachineDraft = (
    machineId: string,
    field: "shopCode" | "dailyRatePallets" | "rotationHours" | "currentWidthMm",
    value: string,
  ) => {
    setMachineDrafts((prev) => ({
      ...prev,
      [machineId]: { ...prev[machineId], [field]: value },
    }));
    setSaveMessage(null);
    setSaveError(null);
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    setSaveError(null);
    setSaveMessage(null);

    try {
      let latest = await fetchAssignments();

      if (!useRotationMode) {
        const assignments = Object.entries(draftAssignments).flatMap(
          ([machineId, personIds]) =>
            personIds.map((personId) => ({ machineId, personId })),
        );
        latest = await saveAssignments({ assignments });
      }

      for (const machine of latest.machines) {
        const draft = machineDrafts[machine.id];
        if (!draft) continue;

        const patch = {
          shopCode: draft.shopCode.trim(),
          dailyRatePallets: Number(draft.dailyRatePallets),
          rotationHours: Number(draft.rotationHours),
          currentWidthMm: Number(draft.currentWidthMm),
        };

        if (
          patch.shopCode !== machine.shopCode ||
          patch.dailyRatePallets !== machine.dailyRatePallets ||
          patch.rotationHours !== machine.rotationHours ||
          patch.currentWidthMm !== machine.storedWidthMm
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

  const handleCreatePeriod = async () => {
    setCreatingPeriod(true);
    setSaveError(null);
    setSaveMessage(null);
    try {
      const assignments = Object.entries(draftAssignments).flatMap(
        ([machineId, personIds]) =>
          personIds.map((personId) => ({ personId, machineId })),
      );

      for (const person of people) {
        const assigned = assignments.some((item) => item.personId === person.id);
        if (!assigned) {
          assignments.push({ personId: person.id, machineId: null });
        }
      }

      const updated = await createRotationPeriod({
        startDate: periodStart,
        endDate: periodEnd,
        note: periodNote,
        assignments,
      });

      setRotations(updated);
      const data = await fetchAssignments();
      applyData(data);
      setSaveMessage("Naujas rotacijos periodas sukurtas.");
    } catch (err) {
      setSaveError((err as ProductionApiError).message);
    } finally {
      setCreatingPeriod(false);
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
          shopCode: code === "KONV" ? "sk1" : "sk2",
          name: code === "KONV" ? "Konvejeris" : "Naujas konvejeris",
          dailyRatePallets: 0,
          rotationHours: 8,
          currentWidthMm: 0,
          storedWidthMm: 0,
          widthSource: "unset" as const,
          widthHint: null,
          assignedPersonIds: [],
        }));

  return (
    <PageShell
      title="Konvejeriai"
      subtitle="Rotacijos periodai, darbuotojų priskyrimas ir našumas"
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

          <WorkNormsBanner rotations={rotations} machines={displayMachines} />

          <Tabs defaultValue="rotacijos" className="space-y-4">
            <TabsList className="h-auto flex-wrap gap-1 rounded-xl bg-muted/60 p-1">
              <TabsTrigger value="rotacijos" className="rounded-lg px-4 py-2">
                Rotacijos
              </TabsTrigger>
              <TabsTrigger value="konvejeriai" className="rounded-lg px-4 py-2">
                Konvejerio nustatymai
              </TabsTrigger>
              <TabsTrigger value="istorija" className="rounded-lg px-4 py-2">
                Istorija
              </TabsTrigger>
            </TabsList>

            <TabsContent value="rotacijos" className="space-y-6">
              {activePeriod ? (
                <Alert className="rounded-xl border-deisida/20 bg-paper px-4 py-4">
                  <CalendarRange className="size-5 text-deisida" />
                  <AlertTitle className="text-base">
                    Aktyvus periodas: {formatLtDate(activePeriod.startDate)} –{" "}
                    {formatLtDate(activePeriod.endDate)}
                  </AlertTitle>
                  <AlertDescription>
                    Perkėlimai viduje periodo reikalauja priežasties. Cechas
                    naudoja šį planą šiandien.
                  </AlertDescription>
                </Alert>
              ) : (
                <Card className="paper-shadow rounded-2xl border-stone-line">
                  <CardHeader>
                    <CardTitle className="text-lg">
                      Naujas penktadienio planas
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <div className="space-y-2">
                      <Label>Pradžia</Label>
                      <LithuanianDatePicker
                        value={periodStart}
                        onChange={handlePeriodStartChange}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Pabaiga (numatytai kitas penktadienis)</Label>
                      <LithuanianDatePicker
                        value={periodEnd}
                        onChange={setPeriodEnd}
                      />
                    </div>
                    <div className="space-y-2 sm:col-span-2 lg:col-span-1">
                      <Label htmlFor="period-note">Pastaba</Label>
                      <Input
                        id="period-note"
                        value={periodNote}
                        onChange={(e) => setPeriodNote(e.target.value)}
                        placeholder="Neprivaloma"
                        className="h-12"
                      />
                    </div>
                    <div className="sm:col-span-2 lg:col-span-3">
                      <Button
                        type="button"
                        onClick={handleCreatePeriod}
                        disabled={creatingPeriod || showEmptyMachines}
                        className="h-12 rounded-xl bg-deisida text-deisida-foreground hover:bg-deisida/90"
                      >
                        {creatingPeriod ? "Kuriama…" : "Sukurti periodą su priskyrimais"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              <AssignmentGrid
                displayMachines={displayMachines}
                people={people}
                draftAssignments={draftAssignments}
                personMachineCode={personMachineCode}
                togglePerson={togglePerson}
                showEmptyMachines={showEmptyMachines}
                readOnlyAssignments={false}
              />

              {people.length > 0 && unassignedPeople.length > 0 ? (
                <p className="text-base text-muted-foreground">
                  Nepriskirti:{" "}
                  {unassignedPeople.map((person) => person.name).join(", ")}
                </p>
              ) : null}
            </TabsContent>

            <TabsContent value="konvejeriai" className="space-y-6">
              <p className="text-sm text-muted-foreground">
                Eilės planavimui naudojamos <strong>paletės per dieną</strong>{" "}
                (sk1 240 / sk2 720 pal./d.). Darbo normos (vnt./d., pvz. 2700 /
                1700) rodomos viršuje — atskira CSV metrika, ne eilės našumas.
              </p>
              <MachineSettingsGrid
                displayMachines={displayMachines}
                machineDrafts={machineDrafts}
                updateMachineDraft={updateMachineDraft}
                showEmptyMachines={showEmptyMachines}
              />
              <Button
                type="button"
                onClick={handleSaveSettings}
                disabled={saving || showEmptyMachines}
                className="h-14 w-full rounded-2xl bg-deisida text-base font-semibold text-deisida-foreground hover:bg-deisida/90 sm:w-auto sm:min-w-48"
              >
                {saving ? "Saugoma…" : "Išsaugoti nustatymus"}
              </Button>
            </TabsContent>

            <TabsContent value="istorija">
              <HistoryList history={rotations?.history ?? []} />
            </TabsContent>
          </Tabs>

          {pendingReassign ? (
            <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
              <Card className="w-full max-w-lg rounded-2xl border-stone-line shadow-xl">
                <CardHeader>
                  <CardTitle className="text-lg">Kodėl perkeliama?</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Textarea
                    value={reassignReason}
                    onChange={(e) => setReassignReason(e.target.value)}
                    placeholder="Privaloma priežastis viduje aktyvaus periodo…"
                    className="min-h-28 text-base"
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      onClick={confirmReassign}
                      disabled={saving || !reassignReason.trim()}
                      className="bg-deisida text-deisida-foreground hover:bg-deisida/90"
                    >
                      {saving ? "Saugoma…" : "Patvirtinti perkėlimą"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setPendingReassign(null)}
                    >
                      Atšaukti
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : null}
        </div>
      ) : null}

      {!loading && !error && machines.length === 0 && !showEmptyMachines ? (
        <EmptyState
          title="Konvejerių duomenų nėra"
          description="Paleiskite db:seed-rotation arba db:import."
        />
      ) : null}
    </PageShell>
  );
}

function WorkNormsBanner({
  rotations,
  machines,
}: {
  rotations: RotationsAdminData | null;
  machines: Machine[];
}) {
  const norms = rotations?.workNorms ?? [];
  const byCode = new Map(norms.map((norm) => [norm.machineCode, norm]));

  return (
    <Card className="paper-shadow rounded-2xl border-stone-line">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Darbo normos ir eilės našumas</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        {MACHINE_ORDER.map((code) => {
          const norm = byCode.get(code);
          const machine = machines.find((item) => item.code === code);
          return (
            <div
              key={code}
              className="rounded-xl border border-stone-line bg-paper p-4"
            >
              <div className="mb-2 flex items-center gap-2">
                <Badge className="bg-deisida text-deisida-foreground">
                  {machine?.shopCode ?? (code === "KONV" ? "sk1" : "sk2")}
                </Badge>
                <span className="text-xs text-muted-foreground">({code})</span>
              </div>
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">
                  Darbo norma (CSV):
                </span>{" "}
                {norm
                  ? `${norm.minPiecesPerDay} vnt./d. — ${norm.label}`
                  : "—"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">
                  Eilės planas (pal./d.):
                </span>{" "}
                {machine?.dailyRatePallets ?? "—"} pal./d.
              </p>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function AssignmentGrid({
  displayMachines,
  people,
  draftAssignments,
  personMachineCode,
  togglePerson,
  showEmptyMachines,
}: {
  displayMachines: Machine[];
  people: Person[];
  draftAssignments: Record<string, string[]>;
  personMachineCode: Map<string, MachineCode>;
  togglePerson: (machineId: string, personId: string) => void;
  showEmptyMachines: boolean;
  readOnlyAssignments: boolean;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {displayMachines.map((machine) => {
        const assignedIds = draftAssignments[machine.id] ?? [];
        const assignedPeople = people.filter((person) =>
          assignedIds.includes(person.id),
        );

        return (
          <Card
            key={machine.id}
            className="paper-shadow rounded-2xl border-stone-line"
          >
            <CardHeader className="border-b border-stone-line pb-4">
              <CardTitle className="flex items-center gap-2 text-xl">
                <span className="rounded-lg bg-deisida px-2.5 py-1 text-sm font-bold text-deisida-foreground">
                  {machine.shopCode}
                </span>
                {machine.name}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5 pt-5">
              <div>
                <div className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <UserCheck className="size-4" />
                  Priskirta šiam konvejeriui
                </div>
                {assignedPeople.length > 0 ? (
                  <div className="mb-4 flex flex-wrap gap-2">
                    {assignedPeople.map((person) => (
                      <button
                        key={person.id}
                        type="button"
                        onClick={() => togglePerson(machine.id, person.id)}
                        disabled={showEmptyMachines}
                        className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-deisida px-4 text-base font-semibold text-deisida-foreground"
                      >
                        <Check className="size-4" />
                        {person.name}
                        <span className="text-sm font-normal opacity-80">
                          · atlaisvinti
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="mb-4 rounded-xl border border-dashed border-stone-line px-4 py-3 text-base text-muted-foreground">
                    Dar niekas nepriskirtas {machine.shopCode}.
                  </p>
                )}

                <div className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Users className="size-4" />
                  Priskirti arba perkelti
                </div>
                <div className="flex flex-wrap gap-2">
                  {people.length === 0 ? (
                    <p className="text-base text-muted-foreground">
                      Darbuotojų sąrašas tuščias
                    </p>
                  ) : (
                    people.map((person) => {
                      const selected = assignedIds.includes(person.id);
                      const otherCode = personMachineCode.get(person.id);
                      if (selected) return null;

                      return (
                        <button
                          key={person.id}
                          type="button"
                          onClick={() => togglePerson(machine.id, person.id)}
                          disabled={showEmptyMachines}
                          className="min-h-12 rounded-xl border border-stone-line bg-paper px-4 text-base font-medium text-foreground hover:bg-muted/80"
                        >
                          {person.name}
                          {otherCode ? (
                            <span className="ml-2 text-sm text-muted-foreground">
                              (dabar{" "}
                              {displayMachines.find((item) => item.code === otherCode)
                                ?.shopCode ?? otherCode}
                              )
                            </span>
                          ) : (
                            <span className="ml-2 text-sm text-muted-foreground">
                              (nepriskirta)
                            </span>
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function MachineSettingsGrid({
  displayMachines,
  machineDrafts,
  updateMachineDraft,
  showEmptyMachines,
}: {
  displayMachines: Machine[];
  machineDrafts: Record<
    string,
    {
      shopCode: string;
      dailyRatePallets: string;
      rotationHours: string;
      currentWidthMm: string;
    }
  >;
  updateMachineDraft: (
    machineId: string,
    field: "shopCode" | "dailyRatePallets" | "rotationHours" | "currentWidthMm",
    value: string,
  ) => void;
  showEmptyMachines: boolean;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {displayMachines.map((machine) => {
        const draft = machineDrafts[machine.id] ?? {
          shopCode: machine.shopCode,
          dailyRatePallets: String(machine.dailyRatePallets),
          rotationHours: String(machine.rotationHours),
          currentWidthMm: String(machine.currentWidthMm),
        };

        return (
          <Card
            key={machine.id}
            className="paper-shadow rounded-2xl border-stone-line"
          >
            <CardHeader className="border-b border-stone-line pb-4">
              <CardTitle className="text-xl">
                {machine.shopCode}{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  ({machine.code})
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 pt-5 sm:grid-cols-2 lg:grid-cols-4">
              <ShopCodeField
                id={`shop-${machine.id}`}
                label="Cecho kodas (rodomas eilėje)"
                value={draft.shopCode}
                onChange={(value) =>
                  updateMachineDraft(machine.id, "shopCode", value)
                }
                disabled={showEmptyMachines}
              />
              <Field
                id={`rate-${machine.id}`}
                label="Paletės per dieną (eilė)"
                value={draft.dailyRatePallets}
                onChange={(value) =>
                  updateMachineDraft(machine.id, "dailyRatePallets", value)
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
                  updateMachineDraft(machine.id, "currentWidthMm", value)
                }
                disabled={showEmptyMachines}
              />
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function HistoryList({ history }: { history: RotationHistoryEntry[] }) {
  if (history.length === 0) {
    return (
      <EmptyState
        title="Istorija tuščia"
        description="Čia matysite penktadienio planus ir perkėlimus su priežastimis."
      />
    );
  }

  return (
    <div className="space-y-3">
      {history.map((entry) => (
        <div
          key={entry.id}
          className="rounded-xl border border-stone-line bg-paper px-4 py-3"
        >
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <History className="size-4" />
            {new Date(entry.changedAt).toLocaleString("lt-LT")}
            {entry.changedByName ? ` · ${entry.changedByName}` : ""}
          </div>
          <p className="mt-1 text-base">
            <strong>{entry.personName}</strong>:{" "}
            {entry.fromCode ?? "—"} → {entry.toCode ?? "atlaisvinta"}
            {entry.action === "plan" ? " (planas)" : ""}
          </p>
          {entry.reason ? (
            <p className="mt-1 text-sm text-muted-foreground">
              Priežastis: {entry.reason}
            </p>
          ) : null}
          <p className="mt-1 text-xs text-muted-foreground">
            Periodas {formatLtDate(entry.periodStartDate)} –{" "}
            {formatLtDate(entry.periodEndDate)}
          </p>
        </div>
      ))}
    </div>
  );
}

function ShopCodeField({
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
        type="text"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="h-12 text-base"
      />
    </div>
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
