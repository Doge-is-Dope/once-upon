import { describe, expect, it } from 'vitest';
import { createExperienceSession } from '../lib/runtime/engine';
import type { ExperienceSession } from '../lib/runtime/types';
import {
  diffSessions,
  EMPTY_UNSEEN,
  mergeUnseen,
} from '../components/frames/book/session-cues';
import { cloneSession, fixtureExperience, testContext } from './fixtures';

function baseSession(): ExperienceSession {
  return createExperienceSession(
    fixtureExperience(),
    'Vera',
    'focus',
    testContext(),
  );
}

describe('session cue diffing', () => {
  it('reports nothing without a revision bump', () => {
    const previous = baseSession();
    const next = cloneSession(previous);
    next.inventoryIds.push('spare_fuse');
    next.clock += 1;

    const diff = diffSessions(previous, next);
    expect(diff.isNewRevision).toBe(false);
    expect(diff.motionCues).toMatchObject({
      resolutionId: null,
      clock: null,
      resolve: null,
      locationId: null,
      inventoryIds: [],
      clueIds: [],
      abilityIds: [],
    });
    expect(diff.additions.clockAdvancedTo).toBeNull();
  });

  it('surfaces new items, clues, abilities, and stat changes on a new revision', () => {
    const previous = baseSession();
    const next = cloneSession(previous);
    next.revision += 1;
    next.clock += 1;
    next.resolve -= 1;
    next.locationId = 'relay_room';
    next.inventoryIds.push('spare_fuse');
    next.clueIds.push('frequency');
    next.unlockedAbilityIds.push('boost_signal');

    const diff = diffSessions(previous, next);
    expect(diff.isNewRevision).toBe(true);
    expect(diff.motionCues).toMatchObject({
      clock: next.clock,
      resolve: next.resolve,
      locationId: 'relay_room',
      inventoryIds: ['spare_fuse'],
      clueIds: ['frequency'],
      abilityIds: ['boost_signal'],
    });
    expect(diff.additions).toEqual({
      clockAdvancedTo: next.clock,
      inventoryIds: ['spare_fuse'],
      clueIds: ['frequency'],
      abilityIds: ['boost_signal'],
    });
  });

  it('flags only a newly created pending resolution', () => {
    const previous = baseSession();
    const withPending = cloneSession(previous);
    withPending.revision += 1;
    withPending.pendingResolution = {
      resolutionId: 'resolution_1',
      actionId: 'inspect_signal',
      intent: 'Inspect the signal.',
      turn: 1,
      createdAt: 1,
      roll: {
        die: 10,
        attribute: 'focus',
        modifier: 1,
        total: 11,
        dc: 10,
        tier: 'success',
      },
      canonicalEvents: [],
      representedEventIds: [],
      mustInclude: [],
      mustNotClaim: [],
      newAbilityIds: [],
    };

    expect(diffSessions(previous, withPending).motionCues.resolutionId).toBe(
      'resolution_1',
    );

    const unchangedPending = cloneSession(withPending);
    unchangedPending.revision += 1;
    expect(
      diffSessions(withPending, unchangedPending).motionCues.resolutionId,
    ).toBeNull();
  });

  it('accumulates unseen ledger entries without duplicates', () => {
    const first = mergeUnseen(EMPTY_UNSEEN, {
      clockAdvancedTo: 1,
      inventoryIds: ['spare_fuse'],
      clueIds: [],
      abilityIds: [],
    });
    const second = mergeUnseen(first, {
      clockAdvancedTo: null,
      inventoryIds: ['spare_fuse', 'wire_cutters'],
      clueIds: ['frequency'],
      abilityIds: [],
    });
    expect(second).toEqual({
      clock: 1,
      inventoryIds: ['spare_fuse', 'wire_cutters'],
      clueIds: ['frequency'],
      abilityIds: [],
    });
  });
});
