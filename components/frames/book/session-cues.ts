import type { ExperienceSession } from '@/lib/runtime/types';

export type MotionCues = {
  resolutionId: string | null;
  clock: number | null;
  resolve: number | null;
  locationId: ExperienceSession['locationId'] | null;
  inventoryIds: string[];
  clueIds: string[];
  abilityIds: ExperienceSession['unlockedAbilityIds'];
};

export const EMPTY_MOTION_CUES: MotionCues = {
  resolutionId: null,
  clock: null,
  resolve: null,
  locationId: null,
  inventoryIds: [],
  clueIds: [],
  abilityIds: [],
};

export type UnseenLedger = {
  clock: number | null;
  inventoryIds: string[];
  clueIds: string[];
  abilityIds: ExperienceSession['unlockedAbilityIds'];
};

export const EMPTY_UNSEEN: UnseenLedger = {
  clock: null,
  inventoryIds: [],
  clueIds: [],
  abilityIds: [],
};

export interface SessionAdditions {
  clockAdvancedTo: number | null;
  inventoryIds: string[];
  clueIds: string[];
  abilityIds: string[];
}

export interface SessionDiff {
  isNewRevision: boolean;
  motionCues: MotionCues;
  additions: SessionAdditions;
}

export function diffSessions(
  previous: ExperienceSession,
  next: ExperienceSession,
): SessionDiff {
  const isNewRevision = next.revision > previous.revision;
  const nextResolutionId = next.pendingResolution?.resolutionId ?? null;
  const previousResolutionId =
    previous.pendingResolution?.resolutionId ?? null;
  const inventoryIds = isNewRevision
    ? next.inventoryIds.filter((id) => !previous.inventoryIds.includes(id))
    : [];
  const clueIds = isNewRevision
    ? next.clueIds.filter((id) => !previous.clueIds.includes(id))
    : [];
  const abilityIds = isNewRevision
    ? next.unlockedAbilityIds.filter(
        (id) => !previous.unlockedAbilityIds.includes(id),
      )
    : [];
  const clockAdvancedTo =
    isNewRevision && next.clock > previous.clock ? next.clock : null;
  return {
    isNewRevision,
    motionCues: {
      resolutionId:
        isNewRevision &&
        nextResolutionId &&
        nextResolutionId !== previousResolutionId
          ? nextResolutionId
          : null,
      clock: clockAdvancedTo,
      resolve:
        isNewRevision && next.resolve < previous.resolve ? next.resolve : null,
      locationId:
        isNewRevision && next.locationId !== previous.locationId
          ? next.locationId
          : null,
      inventoryIds,
      clueIds,
      abilityIds,
    },
    additions: { clockAdvancedTo, inventoryIds, clueIds, abilityIds },
  };
}

export function mergeUnseen(
  current: UnseenLedger,
  additions: SessionAdditions,
): UnseenLedger {
  return {
    clock: additions.clockAdvancedTo ?? current.clock,
    inventoryIds: [
      ...new Set([...current.inventoryIds, ...additions.inventoryIds]),
    ],
    clueIds: [...new Set([...current.clueIds, ...additions.clueIds])],
    abilityIds: [...new Set([...current.abilityIds, ...additions.abilityIds])],
  };
}
