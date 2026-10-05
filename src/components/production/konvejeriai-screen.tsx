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
import { formatPalletRateWithNorm } from "@/lib/queue/rate-labels";
import {
  createRotationPeriod,
  fetchAssignments,
  patchMachine,
  reassignRotation,
  saveAssignments,
  updateRotationPeriod,
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

import { SHOP_MACHINE_ORDER } from "@/lib/queue/constants";
import type { KonvejeriaiTab } from "@/lib/konvejeriai-tabs";
import { resolveKonvejeriaiTab } from "@/lib/konvejeriai-tabs";

function buildDraftState(data: AssignmentsResponse) {
  const sorted = [...data.machines].sort(
    (a, b) =>
      (SHOP_MACHINE_ORDER as readonly string[]).indexOf(a.code) -
      (SHOP_MACHINE_ORDER as readonly string[]).indexOf(b.code),
  );
  const assignments: Record<string, string[]> = {};
  const drafts: Record<
    string,
    {
      shopCode: string;
      workNormPiecesPerDay: string;
      currentWidthMm: string;
    }
  > = {};
  for (const machine of sorted) {
    assignments[machine.id] = [...machine.assignedPersonIds];
    drafts[machine.id] = {
      shopCode: machine.shopCode,
      workNormPiecesPerDay: String(machine.workNormPiecesPerDay),
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

function normalizeForSearch(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function personMatchesSearch(name: string, search: string): boolean {
  if (!search) return true;
  const normalizedSearch = normalizeForSearch(search);
  const tokens = normalizedSearch.split(/\s+/).filter(Boolean);
  const normalizedName = normalizeForSearch(name);
  return tokens.every((token) => normalizedName.includes(token));
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
  initialTab?: KonvejeriaiTab;
}

export function KonvejeriaiScreen({
  initialData,
  initialTab = "konvejeriai",
}: KonvejeriaiScreenProps) {
  const [activeTab, setActiveTab] = useState(initialTab);
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
        workNormPiecesPerDay: string;
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
  const [editingPeriodStart, setEditingPeriodStart] = useState("");
  const [editingPeriodEnd, setEditingPeriodEnd] = useState("");
  const [editingPeriodNote, setEditingPeriodNote] = useState("");
  const [savingPeriod, setSavingPeriod] = useState(false);

  const handlePeriodStartChange = (value: string) => {
    setPeriodStart(value);
    setPeriodEnd(defaultPeriodEnd(value));
  };

  const [pendingReassign, setPendingReassign] = useState<{
    machineId: string;
    personIds: string[];
    action: "assign" | "release";
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

  useEffect(() => {
    if (!activePeriod) return;
    setEditingPeriodStart(activePeriod.startDate);
    setEditingPeriodEnd(activePeriod.endDate);
    setEditingPeriodNote(activePeriod.note ?? "");
  }, [activePeriod?.id, activePeriod?.startDate, activePeriod?.endDate, activePeriod?.note]);

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

  const assignInRotationPeriod = async (
    machineId: string | null,
    personIds: string[],
    reason: string,
  ) => {
    if (!activePeriod || personIds.length === 0) return;
    setSaving(true);
    setSaveError(null);
    try {
      let updated: RotationsAdminData | null = null;
      for (const personId of personIds) {
        updated = await reassignRotation({
          periodId: activePeriod.id,
          personId,
          machineId,
          reason,
        });
      }
      if (updated) setRotations(updated);
      const data = await fetchAssignments();
      applyData(data);
      const count = personIds.length;
      setSaveMessage(
        machineId
          ? count === 1
            ? "Darbuotojas priskirtas."
            : `Priskirta ${count} darbuotojai.`
          : count === 1
            ? "Darbuotojas atlaisvintas."
            : `Atlaisvinta ${count} darbuotojai.`,
      );
    } catch (err) {
      setSaveError((err as ProductionApiError).message);
      const data = await fetchAssignments();
      applyData(data);
    } finally {
      setSaving(false);
    }
  };

  const applyLocalAssignments = (machineId: string, personIds: string[]) => {
    setDraftAssignments((prev) => {
      const next = { ...prev };
      for (const personId of personIds) {
        for (const id of Object.keys(next)) {
          next[id] = next[id].filter((pid) => pid !== personId);
        }
        const current = next[machineId] ?? [];
        if (!current.includes(personId)) {
          next[machineId] = [...current, personId];
        }
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
      const currentMachine = personMachineCode.get(personId);
      if (!isAssigned && !currentMachine) {
        await assignInRotationPeriod(
          machineId,
          [personId],
          "Pradinis priskyrimas",
        );
        return;
      }
      setPendingReassign({
        machineId,
        personIds: [personId],
        action: isAssigned ? "release" : "assign",
      });
      setReassignReason("");
      return;
    }

    applyLocalAssignment(machineId, personId);

    setSaving(true);
    setSaveError(null);
    try {
      const nextAssignments = { ...draftAssignments };
      for (const id of Object.keys(nextAssignments)) {
        nextAssignments[id] = nextAssignments[id].filter((pid) => pid !== personId);
      }
      if (!isAssigned) {
        nextAssignments[machineId] = [...(nextAssignments[machineId] ?? []), personId];
      }

      const assignments = Object.entries(nextAssignments).flatMap(
        ([mid, personIds]) =>
          personIds.map((pid) => ({ machineId: mid, personId: pid })),
      );
      const latest = await saveAssignments({ assignments });
      applyData(latest);
      setSaveMessage(isAssigned ? "Darbuotojas atlaisvintas." : "Darbuotojas priskirtas.");
    } catch (err) {
      const apiErr = err as ProductionApiError;
      setSaveError(apiErr.message);
      const data = await fetchAssignments();
      applyData(data);
    } finally {
      setSaving(false);
    }
  };

  const assignPeople = async (machineId: string, personIds: string[]) => {
    const uniqueIds = [...new Set(personIds)].filter(Boolean);
    if (uniqueIds.length === 0) return;

    const assignedIds = draftAssignments[machineId] ?? [];
    const toAdd = uniqueIds.filter((id) => !assignedIds.includes(id));
    if (toAdd.length === 0) return;

    if (useRotationMode && activePeriod) {
      const directAssign: string[] = [];
      const needsReason: string[] = [];
      for (const personId of toAdd) {
        if (personMachineCode.get(personId)) {
          needsReason.push(personId);
        } else {
          directAssign.push(personId);
        }
      }

      if (directAssign.length > 0) {
        await assignInRotationPeriod(
          machineId,
          directAssign,
          "Pradinis priskyrimas",
        );
      }

      if (needsReason.length > 0) {
        setPendingReassign({
          machineId,
          personIds: needsReason,
          action: "assign",
        });
        setReassignReason("");
      }
      return;
    }

    applyLocalAssignments(machineId, toAdd);
    setSaving(true);
    setSaveError(null);
    try {
      const nextAssignments = { ...draftAssignments };
      for (const personId of toAdd) {
        for (const id of Object.keys(nextAssignments)) {
          nextAssignments[id] = nextAssignments[id].filter(
            (pid) => pid !== personId,
          );
        }
        nextAssignments[machineId] = [
          ...(nextAssignments[machineId] ?? []),
          personId,
        ];
      }

      const assignments = Object.entries(nextAssignments).flatMap(
        ([mid, ids]) => ids.map((personId) => ({ machineId: mid, personId })),
      );
      const latest = await saveAssignments({ assignments });
      applyData(latest);
      setSaveMessage(
        toAdd.length === 1
          ? "Darbuotojas priskirtas."
          : `Priskirta ${toAdd.length} darbuotojai.`,
      );
    } catch (err) {
      setSaveError((err as ProductionApiError).message);
      const data = await fetchAssignments();
      applyData(data);
    } finally {
      setSaving(false);
    }
  };

  const confirmReassign = async () => {
    if (!pendingReassign || !activePeriod) return;
    const targetMachineId =
      pendingReassign.action === "release" ? null : pendingReassign.machineId;
    await assignInRotationPeriod(
      targetMachineId,
      pendingReassign.personIds,
      reassignReason,
    );
    setPendingReassign(null);
    setReassignReason("");
  };

  const updateMachineDraft = (
    machineId: string,
    field: "shopCode" | "workNormPiecesPerDay" | "currentWidthMm",
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
          workNormPiecesPerDay: Number(draft.workNormPiecesPerDay),
          currentWidthMm: Number(draft.currentWidthMm),
        };

        if (
          patch.shopCode !== machine.shopCode ||
          patch.workNormPiecesPerDay !== machine.workNormPiecesPerDay ||
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

  const handleSaveActivePeriod = async () => {
    if (!activePeriod) return;
    setSavingPeriod(true);
    setSaveError(null);
    setSaveMessage(null);
    try {
      const updated = await updateRotationPeriod({
        periodId: activePeriod.id,
        startDate: editingPeriodStart,
        endDate: editingPeriodEnd,
        note: editingPeriodNote,
      });
      setRotations(updated);
      const data = await fetchAssignments();
      applyData(data);
      setSaveMessage("Rotacijos periodas išsaugotas.");
    } catch (err) {
      setSaveError((err as ProductionApiError).message);
    } finally {
      setSavingPeriod(false);
    }
  };

  const handleCreatePeriod = async () => {
    setCreatingPeriod(true);
    setSaveError(null);
    setSaveMessage(null);
    try {
      const assignments: { personId: string; machineId: string | null }[] =
        Object.entries(draftAssignments).flatMap(([machineId, personIds]) =>
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
      : SHOP_MACHINE_ORDER.map((code) => ({
          id: `placeholder-${code}`,
          code,
          shopCode: code,
          name: code,
          dailyRatePallets: 0,
          workNormPiecesPerDay: 0,
          rotationHours: 4,
          currentWidthMm: 0,
          storedWidthMm: 0,
          widthSource: "unset" as const,
          widthHint: null,
          assignedPersonIds: [],
        }));

  return (
    <PageShell
      title="Konvejeriai"
      subtitle="Savaitinė rotacija: darbuotojai priskiriami konvejeriui pasirinktam laikotarpiui"
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

          <Tabs
            value={activeTab}
            onValueChange={(value) =>
              setActiveTab(resolveKonvejeriaiTab(value))
            }
            className="space-y-4"
          >
            <TabsList className="h-auto flex-wrap gap-1 rounded-xl bg-muted/60 p-1">
              <TabsTrigger value="konvejeriai" className="rounded-lg px-4 py-2">
                Staklių plotis (mm)
              </TabsTrigger>
              <TabsTrigger value="rotacijos" className="rounded-lg px-4 py-2">
                Rotacijos
              </TabsTrigger>
              <TabsTrigger value="istorija" className="rounded-lg px-4 py-2">
                Istorija
              </TabsTrigger>
            </TabsList>

            <TabsContent value="rotacijos" className="space-y-6">
              {activePeriod ? (
                <Card className="paper-shadow rounded-2xl border-stone-line">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <CalendarRange className="size-5 text-deisida" />
                      Aktyvus rotacijos periodas
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <div className="space-y-2">
                      <Label>Pradžia</Label>
                      <LithuanianDatePicker
                        value={editingPeriodStart}
                        onChange={setEditingPeriodStart}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Pabaiga</Label>
                      <LithuanianDatePicker
                        value={editingPeriodEnd}
                        onChange={setEditingPeriodEnd}
                      />
                    </div>
                    <div className="space-y-2 sm:col-span-2 lg:col-span-1">
                      <Label htmlFor="active-period-note">Pastaba</Label>
                      <Input
                        id="active-period-note"
                        value={editingPeriodNote}
                        onChange={(e) => setEditingPeriodNote(e.target.value)}
                        placeholder="Neprivaloma"
                        className="h-12"
                      />
                    </div>
                    <p className="text-sm text-muted-foreground sm:col-span-2 lg:col-span-3">
                      Per šį laikotarpį darbuotojai dirba <strong>tik prie
                      priskirto konvejerio</strong>. Galima keli žmonės vienai
                      staklei. Perkėlimas arba atlaisvinimas viduje periodo —
                      su priežastimi.
                    </p>
                  </CardContent>
                </Card>
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
                assignPeople={assignPeople}
                showEmptyMachines={showEmptyMachines}
                saving={saving}
              />

              {activePeriod ? (
                <Button
                  type="button"
                  onClick={handleSaveActivePeriod}
                  disabled={savingPeriod || saving || showEmptyMachines}
                  className="h-14 w-full rounded-2xl bg-deisida text-base font-semibold text-deisida-foreground hover:bg-deisida/90 sm:w-auto sm:min-w-48"
                >
                  {savingPeriod ? "Saugoma…" : "Išsaugoti periodą"}
                </Button>
              ) : null}

              {people.length > 0 && unassignedPeople.length > 0 ? (
                <p className="text-base text-muted-foreground">
                  Nepriskirti:{" "}
                  {unassignedPeople.map((person) => person.name).join(", ")}
                </p>
              ) : null}
            </TabsContent>

            <TabsContent value="konvejeriai" className="space-y-6">
              <p className="text-sm text-muted-foreground">
                <strong>Norma (vnt./d.)</strong> — iš Excel pjovimo normų; pagal
                ją skaičiuojamas pjovimo laikas. <strong>Dabartinis plotis (mm)</strong>{" "}
                — operatoriaus suregulavimas (Perskirstyti ±5 mm). Keiskite ir ant{" "}
                <a href="/eile" className="font-medium text-deisida underline">
                  /eile
                </a>
                .
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
                  <CardTitle className="text-lg">
                    {pendingReassign.action === "release"
                      ? pendingReassign.personIds.length > 1
                        ? "Kodėl atlaisvinami?"
                        : "Kodėl atlaisvinama?"
                      : pendingReassign.personIds.length > 1
                        ? `Kodėl perkeliami? (${pendingReassign.personIds.length})`
                        : "Kodėl perkeliama?"}
                  </CardTitle>
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
        <CardTitle className="text-lg">Darbo normos (Excel)</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        {(machines.length > 0
          ? machines.map((item) => item.code)
          : [...SHOP_MACHINE_ORDER]
        ).map((code) => {
          const norm = byCode.get(code);
          const machine = machines.find((item) => item.code === code);
          return (
            <div
              key={code}
              className="rounded-xl border border-stone-line bg-paper p-4"
            >
              <div className="mb-2 flex items-center gap-2">
                <Badge className="bg-deisida text-deisida-foreground">
                  {code}
                </Badge>
                {machine?.name ? (
                  <span className="text-xs text-muted-foreground">
                    ({machine.name})
                  </span>
                ) : null}
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
                  Naudojama plane:
                </span>{" "}
                {machine
                  ? formatPalletRateWithNorm(
                      machine.dailyRatePallets,
                      machine.workNormPiecesPerDay,
                    )
                  : "—"}
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
  assignPeople,
  showEmptyMachines,
  saving,
}: {
  displayMachines: Machine[];
  people: Person[];
  draftAssignments: Record<string, string[]>;
  personMachineCode: Map<string, MachineCode>;
  togglePerson: (machineId: string, personId: string) => void;
  assignPeople: (machineId: string, personIds: string[]) => Promise<void>;
  showEmptyMachines: boolean;
  saving: boolean;
}) {
  const [searchByMachine, setSearchByMachine] = useState<Record<string, string>>(
    {},
  );
  const [selectedByMachine, setSelectedByMachine] = useState<
    Record<string, string[]>
  >({});

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {displayMachines.map((machine) => {
        const assignedIds = draftAssignments[machine.id] ?? [];
        const assignedPeople = people.filter((person) =>
          assignedIds.includes(person.id),
        );
        const search = (searchByMachine[machine.id] ?? "").trim();
        const selectedPersonIds = (selectedByMachine[machine.id] ?? []).filter(
          (id) => !assignedIds.includes(id),
        );
        const availablePeople = people.filter((person) => {
          if (assignedIds.includes(person.id)) return false;
          return personMatchesSearch(person.name, search);
        });
        const resolvedSelectedIds = selectedPersonIds.filter((id) =>
          availablePeople.some((person) => person.id === id),
        );

        const toggleSelection = (personId: string) => {
          setSelectedByMachine((prev) => {
            const current = prev[machine.id] ?? [];
            const next = current.includes(personId)
              ? current.filter((id) => id !== personId)
              : [...current, personId];
            return { ...prev, [machine.id]: next };
          });
        };

        return (
          <Card
            key={machine.id}
            className="paper-shadow rounded-2xl border-stone-line"
          >
            <CardHeader className="border-b border-stone-line pb-4">
              <CardTitle className="flex flex-wrap items-center gap-2 text-xl">
                <span className="rounded-lg bg-deisida px-2.5 py-1 text-sm font-bold text-deisida-foreground">
                  {machine.code}
                </span>
                {machine.name}
                {assignedPeople.length > 0 ? (
                  <Badge variant="outline" className="text-xs font-normal">
                    {assignedPeople.length}{" "}
                    {assignedPeople.length === 1 ? "darbuotojas" : "darbuotojai"}
                  </Badge>
                ) : null}
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
                        disabled={showEmptyMachines || saving}
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
                    Dar niekas nepriskirtas {machine.code}.
                  </p>
                )}

                <div className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Users className="size-4" />
                  Priskirti arba perkelti
                </div>
                {people.length === 0 ? (
                  <p className="text-base text-muted-foreground">
                    Darbuotojų sąrašas tuščias
                  </p>
                ) : (
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label htmlFor={`search-${machine.id}`}>Ieškoti pagal vardą</Label>
                      <Input
                        id={`search-${machine.id}`}
                        value={searchByMachine[machine.id] ?? ""}
                        onChange={(e) => {
                          const value = e.target.value;
                          setSearchByMachine((prev) => ({
                            ...prev,
                            [machine.id]: value,
                          }));
                          const nextMatches = people.filter((person) => {
                            if (assignedIds.includes(person.id)) return false;
                            return personMatchesSearch(person.name, value.trim());
                          });
                          if (nextMatches.length === 1) {
                            setSelectedByMachine((prev) => {
                              const current = prev[machine.id] ?? [];
                              const only = nextMatches[0].id;
                              if (current.includes(only)) return prev;
                              return { ...prev, [machine.id]: [...current, only] };
                            });
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && resolvedSelectedIds.length > 0) {
                            e.preventDefault();
                            void (async () => {
                              await assignPeople(machine.id, resolvedSelectedIds);
                              setSearchByMachine((prev) => ({
                                ...prev,
                                [machine.id]: "",
                              }));
                              setSelectedByMachine((prev) => ({
                                ...prev,
                                [machine.id]: [],
                              }));
                            })();
                          }
                        }}
                        placeholder="Pvz. Jonas, Rasa…"
                        className="h-12 text-base"
                        disabled={showEmptyMachines}
                        autoComplete="off"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label id={`person-${machine.id}`}>
                        Darbuotojai{" "}
                        {resolvedSelectedIds.length > 0
                          ? `(${resolvedSelectedIds.length} pažymėta)`
                          : ""}
                      </Label>
                      <ul
                        aria-labelledby={`person-${machine.id}`}
                        className="max-h-52 space-y-1 overflow-y-auto rounded-xl border border-stone-line bg-paper p-1"
                      >
                        {availablePeople.length === 0 ? (
                          <li className="px-3 py-4 text-center text-sm text-muted-foreground">
                            {search
                              ? `Pagal „${search}“ nieko nerasta.`
                              : "Visi darbuotojai jau priskirti šiai staklei."}
                          </li>
                        ) : (
                          availablePeople.map((person) => {
                            const otherCode = personMachineCode.get(person.id);
                            const isSelected = resolvedSelectedIds.includes(
                              person.id,
                            );
                            return (
                              <li key={person.id}>
                                <button
                                  type="button"
                                  disabled={showEmptyMachines}
                                  onClick={() => toggleSelection(person.id)}
                                  className={[
                                    "flex w-full min-h-11 items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-base transition-colors",
                                    isSelected
                                      ? "bg-deisida font-semibold text-deisida-foreground"
                                      : "hover:bg-muted/60",
                                  ].join(" ")}
                                >
                                  <span className="flex items-center gap-2">
                                    <span
                                      className={[
                                        "flex size-5 shrink-0 items-center justify-center rounded border",
                                        isSelected
                                          ? "border-deisida-foreground bg-deisida-foreground text-deisida"
                                          : "border-stone-line bg-paper",
                                      ].join(" ")}
                                    >
                                      {isSelected ? (
                                        <Check className="size-3.5" />
                                      ) : null}
                                    </span>
                                    {person.name}
                                  </span>
                                  <span
                                    className={
                                      isSelected
                                        ? "text-sm font-normal opacity-90"
                                        : "text-sm text-muted-foreground"
                                    }
                                  >
                                    {otherCode
                                      ? `dabar ${otherCode}`
                                      : "nepriskirta"}
                                  </span>
                                </button>
                              </li>
                            );
                          })
                        )}
                      </ul>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        onClick={async () => {
                          await assignPeople(machine.id, resolvedSelectedIds);
                          setSearchByMachine((prev) => ({
                            ...prev,
                            [machine.id]: "",
                          }));
                          setSelectedByMachine((prev) => ({
                            ...prev,
                            [machine.id]: [],
                          }));
                        }}
                        disabled={
                          showEmptyMachines ||
                          saving ||
                          resolvedSelectedIds.length === 0
                        }
                        className="h-12 rounded-xl bg-deisida text-deisida-foreground hover:bg-deisida/90 sm:px-6"
                      >
                        {saving
                          ? "Saugoma…"
                          : resolvedSelectedIds.length > 1
                            ? `Priskirti (${resolvedSelectedIds.length})`
                            : "Priskirti"}
                      </Button>
                      {resolvedSelectedIds.length > 0 ? (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() =>
                            setSelectedByMachine((prev) => ({
                              ...prev,
                              [machine.id]: [],
                            }))
                          }
                          disabled={showEmptyMachines || saving}
                          className="h-12 rounded-xl"
                        >
                          Nuimti žymėjimą
                        </Button>
                      ) : null}
                    </div>
                  </div>
                )}
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
      workNormPiecesPerDay: string;
      currentWidthMm: string;
    }
  >;
  updateMachineDraft: (
    machineId: string,
    field: "shopCode" | "workNormPiecesPerDay" | "currentWidthMm",
    value: string,
  ) => void;
  showEmptyMachines: boolean;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {displayMachines.map((machine) => {
        const draft = machineDrafts[machine.id] ?? {
          shopCode: machine.shopCode,
          workNormPiecesPerDay: String(machine.workNormPiecesPerDay),
          currentWidthMm: String(machine.currentWidthMm),
        };

        return (
          <Card
            key={machine.id}
            className="paper-shadow rounded-2xl border-stone-line"
          >
            <CardHeader className="border-b border-stone-line pb-4">
              <CardTitle className="text-xl">
                {machine.code}{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  ({machine.name})
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 pt-5 sm:grid-cols-2">
              <Field
                id={`rate-${machine.id}`}
                label="Norma pjovimui (vnt./d.)"
                value={draft.workNormPiecesPerDay}
                onChange={(value) =>
                  updateMachineDraft(machine.id, "workNormPiecesPerDay", value)
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
