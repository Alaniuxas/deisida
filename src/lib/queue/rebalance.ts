import { isJobCompatibleWithStoredSetup } from "./machine-width";
import { MIN_IDLE_GAP_HOURS } from "./backfill-idle-lanes";
import { lockedWeekMondayStart } from "./balance";
import { durationHoursFromPlan, workHoursUntil } from "./work-hours";
import { lockedWeekFridayEnd, type LockedWeek } from "./week";

export interface RebalanceMachineInfo {
  id: string;
  code: string;
  currentWidthMm: number | null;
}

export interface RebalancePlanItem {
  jobId: string;
  machineId: string;
  widthMm: number;
  plannedStart: string;
  plannedEnd?: string;
}

function itemLoadHours(item: RebalancePlanItem): number {
  if (!item.plannedEnd) {
    return 1;
  }
  return durationHoursFromPlan(item.plannedStart, item.plannedEnd);
}

function receiverIdleHours(
  items: RebalancePlanItem[],
  lockedWeek: LockedWeek,
): number {
  const fridayEnd = lockedWeekFridayEnd(lockedWeek);
  if (items.length === 0) {
    return workHoursUntil(lockedWeekMondayStart(lockedWeek), fridayEnd);
  }
  let latest = new Date(items[0].plannedEnd ?? items[0].plannedStart);
  for (const item of items) {
    const end = new Date(item.plannedEnd ?? item.plannedStart);
    if (end.getTime() > latest.getTime()) {
      latest = end;
    }
  }
  return workHoursUntil(latest, fridayEnd);
}

const MIN_REBALANCE_HOUR_GAP = 4;

export interface RebalanceMove {
  donorId: string;
  receiverId: string;
  donorCode: string;
  receiverCode: string;
  candidate: RebalancePlanItem;
}

export interface RebalanceState {
  canRebalance: boolean;
  pendingMoveCount: number;
  reason: string;
  blockers: string[];
  nextMove: RebalanceMove | null;
}

export const REBALANCE_RULES_FOR_AI = `Automatinio „Perskirstyti darbus“ taisyklės (privaloma laikytis):
- Tik užrakintos savaitės darbai.
- Gavėjas turi turėti ≥4 produktyvias val. iki penktadienio 17:00 (kaip backfill).
- Donoras turi turėti ≥2 darbus daugiau nei gavėjas, arba ≥4 h apkrovos skirtumą.
- Darbo plotis turi sutapti su gavėjo admin nustatytu staklės plotiu ±5 mm.
- Jei perkėlimas neįmanomas dėl plotų — NEsiūlyk „perkelti iš X į Y“; rašyk, kad reikia rankinio perkėlimo arba pakeisti staklės plotį.
- Jei galimas automatinis perkėlimas — nurodyk konkretų donorą→gavėją ir plotį.`;

function cloneBuckets(
  buckets: Map<string, RebalancePlanItem[]>,
): Map<string, RebalancePlanItem[]> {
  const copy = new Map<string, RebalancePlanItem[]>();
  for (const [id, items] of buckets) {
    copy.set(id, [...items]);
  }
  return copy;
}

export function buildRebalanceBuckets(
  shopIds: string[],
  lockedItems: RebalancePlanItem[],
): Map<string, RebalancePlanItem[]> {
  const buckets = new Map<string, RebalancePlanItem[]>();
  for (const id of shopIds) {
    buckets.set(id, []);
  }
  for (const item of lockedItems) {
    if (!buckets.has(item.machineId)) {
      continue;
    }
    buckets.get(item.machineId)!.push(item);
  }
  return buckets;
}

export function findRebalanceMove(
  buckets: Map<string, RebalancePlanItem[]>,
  shopIds: string[],
  machineById: Map<string, Pick<RebalanceMachineInfo, "code" | "currentWidthMm">>,
  lockedWeek: LockedWeek,
): RebalanceMove | null {
  const ranked = shopIds
    .map((id) => [id, buckets.get(id) ?? []] as const)
    .sort((left, right) => right[1].length - left[1].length);

  const donors = [...ranked].filter(([, items]) => items.length > 0);
  const receivers = [...ranked].sort((left, right) => left[1].length - right[1].length);

  for (const [donorId, donorItems] of donors) {
    for (const [receiverId, receiverItems] of receivers) {
      if (donorId === receiverId) continue;
      if (receiverIdleHours(receiverItems, lockedWeek) < MIN_IDLE_GAP_HOURS) {
        continue;
      }
      const countGap = donorItems.length - receiverItems.length;
      const hourGap =
        donorItems.reduce((sum, item) => sum + itemLoadHours(item), 0) -
        receiverItems.reduce((sum, item) => sum + itemLoadHours(item), 0);
      if (countGap < 2 && hourGap < MIN_REBALANCE_HOUR_GAP) continue;

      const receiver = machineById.get(receiverId);
      const compatible = donorItems.filter((item) =>
        isJobCompatibleWithStoredSetup(item.widthMm, receiver?.currentWidthMm),
      );
      const candidate = compatible.sort((left, right) => {
        const receiverWidth = receiver?.currentWidthMm ?? 0;
        const leftGap = Math.abs(left.widthMm - receiverWidth);
        const rightGap = Math.abs(right.widthMm - receiverWidth);
        if (leftGap !== rightGap) {
          return leftGap - rightGap;
        }
        return right.plannedStart.localeCompare(left.plannedStart);
      })[0];
      if (!candidate) {
        continue;
      }

      const donor = machineById.get(donorId);
      return {
        donorId,
        receiverId,
        donorCode: donor?.code ?? donorId,
        receiverCode: receiver?.code ?? receiverId,
        candidate,
      };
    }
  }

  return null;
}

export function countRebalanceMoves(
  buckets: Map<string, RebalancePlanItem[]>,
  shopIds: string[],
  machineById: Map<string, Pick<RebalanceMachineInfo, "code" | "currentWidthMm">>,
  lockedWeek: LockedWeek,
): number {
  const simulated = cloneBuckets(buckets);
  let count = 0;
  for (let pass = 0; pass < 100; pass += 1) {
    const move = findRebalanceMove(simulated, shopIds, machineById, lockedWeek);
    if (!move) {
      break;
    }
    const donorItems = simulated.get(move.donorId)!;
    const receiverItems = simulated.get(move.receiverId)!;
    donorItems.splice(
      donorItems.findIndex((item) => item.jobId === move.candidate.jobId),
      1,
    );
    receiverItems.push({ ...move.candidate, machineId: move.receiverId });
    count += 1;
  }
  return count;
}

export function describeRebalanceBlockers(
  buckets: Map<string, RebalancePlanItem[]>,
  shopIds: string[],
  machineById: Map<string, Pick<RebalanceMachineInfo, "code" | "currentWidthMm">>,
  lockedWeek: LockedWeek,
): { reason: string; blockers: string[] } {
  const ranked = shopIds
    .map((id) => [id, buckets.get(id) ?? []] as const)
    .sort((left, right) => right[1].length - left[1].length);

  const imbalances: string[] = [];
  const blockers: string[] = [];

  for (const [donorId, donorItems] of ranked) {
    for (const [receiverId, receiverItems] of ranked) {
      if (donorId === receiverId) continue;
      const gap = donorItems.length - receiverItems.length;
      if (gap < 2) continue;

      const donor = machineById.get(donorId);
      const receiver = machineById.get(receiverId);
      const donorCode = donor?.code ?? donorId;
      const receiverCode = receiver?.code ?? receiverId;
      imbalances.push(
        `${donorCode}(${donorItems.length}) → ${receiverCode}(${receiverItems.length})`,
      );

      if (receiverIdleHours(receiverItems, lockedWeek) < MIN_IDLE_GAP_HOURS) {
        blockers.push(
          `${receiverCode} jau pilna iki penktadienio 17:00 (≥4 h nėra)`,
        );
        continue;
      }

      const compatible = donorItems.filter((item) =>
        isJobCompatibleWithStoredSetup(item.widthMm, receiver?.currentWidthMm),
      );
      if (compatible.length === 0 && receiver?.currentWidthMm) {
        const donorWidths = [...new Set(donorItems.map((item) => item.widthMm))]
          .sort((left, right) => left - right)
          .map((width) => `${width} mm`)
          .join(", ");
        blockers.push(
          `${receiverCode} (${receiver.currentWidthMm} mm) nepriima ${donorCode} darbų (${donorWidths})`,
        );
      }
    }
  }

  if (imbalances.length === 0) {
    return {
      reason: "Apkrova subalansuota.",
      blockers: [],
    };
  }

  const uniqueBlocks = [...new Set(blockers)];
  if (uniqueBlocks.length > 0) {
    return {
      reason: "Automatinio perskirstymo nėra.",
      blockers: uniqueBlocks,
    };
  }

  return {
    reason: "Automatinio perskirstymo nėra.",
    blockers: [],
  };
}

export function analyzeRebalanceState(
  shopIds: string[],
  lockedItems: RebalancePlanItem[],
  machines: RebalanceMachineInfo[],
  lockedWeek: LockedWeek,
): RebalanceState {
  const machineById = new Map(
    machines.map((machine) => [
      machine.id,
      { code: machine.code, currentWidthMm: machine.currentWidthMm },
    ]),
  );
  const buckets = buildRebalanceBuckets(shopIds, lockedItems);
  const pendingMoveCount = countRebalanceMoves(
    buckets,
    shopIds,
    machineById,
    lockedWeek,
  );
  const nextMove = findRebalanceMove(buckets, shopIds, machineById, lockedWeek);

  if (pendingMoveCount > 0 && nextMove) {
    return {
      canRebalance: true,
      pendingMoveCount,
      reason: `Galima perkelti ${pendingMoveCount} darb.`,
      blockers: [],
      nextMove,
    };
  }

  const { reason, blockers } = describeRebalanceBlockers(
    buckets,
    shopIds,
    machineById,
    lockedWeek,
  );
  return {
    canRebalance: false,
    pendingMoveCount: 0,
    reason,
    blockers,
    nextMove: null,
  };
}

/** Sutapatina AI pastabas su realia perskirstymo būsena (gyvai, ne tik iš DB). */
export function alignAiCommentsWithRebalance(
  comments: string[],
  state: RebalanceState,
): string[] {
  if (!state.canRebalance) {
    return [];
  }

  return comments
    .filter((comment) => !/perkelti|perkėlim|perkrauta|per mažai darbų/i.test(comment))
    .slice(0, 5);
}
