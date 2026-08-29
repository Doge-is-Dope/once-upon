import { describe, expect, it } from 'vitest';
import {
  buildBookLeaves,
  formatPageNumber,
  latestBookLeafIndex,
} from '../components/frames/book/model';
import {
  commitNarration,
  createExperienceSession,
  resolveAction,
} from '../lib/runtime/engine';
import type { EngineContext } from '../lib/runtime/types';
import { experienceDefinition } from '../experiences/the-last-manuscript/definition';

function context(): EngineContext {
  let sequence = 0;
  return {
    now: () => 1_700_000_000_000 + sequence,
    id: (prefix) => `${prefix}_book_${++sequence}`,
  };
}

describe('book view model', () => {
  it('formats the six manuscript pages as Roman numerals', () => {
    expect(
      Array.from({ length: 6 }, (_, index) => formatPageNumber(index + 1)),
    ).toEqual(['I', 'II', 'III', 'IV', 'V', 'VI']);
  });
  it('always creates the bookplate, prologue, and six story leaves', () => {
    const session = createExperienceSession(
      experienceDefinition,
      'Mara',
      'nerve',
      context(),
    );
    const leaves = buildBookLeaves(session);
    expect(leaves).toHaveLength(8);
    expect(leaves.map((leaf) => leaf.kind)).toEqual([
      'bookplate',
      'prologue',
      'unwritten',
      'unwritten',
      'unwritten',
      'unwritten',
      'unwritten',
      'unwritten',
    ]);
    expect(latestBookLeafIndex(session)).toBe(1);
  });

  it('places a saved resolution on its own draft page', () => {
    const session = createExperienceSession(
      experienceDefinition,
      'Mara',
      'wits',
      context(),
    );
    const rolled = resolveAction(
      experienceDefinition,
      session,
      {
        operationId: 'book_action',
        expectedRevision: session.revision,
        targetId: 'search_hearth',
        approach: 'wits',
        intent: 'Search the dying hearth.',
      },
      14,
      context(),
    ).session;
    const leaves = buildBookLeaves(rolled);
    expect(leaves[1].kind).toBe('prologue');
    expect(leaves[1].resolution).toBeNull();
    expect(leaves[2]).toMatchObject({ kind: 'draft', turn: 1 });
    expect(leaves[2].resolution?.roll.die).toBe(14);
    expect(latestBookLeafIndex(rolled)).toBe(2);
  });

  it('turns the draft into a completed page at the same leaf', () => {
    const initial = createExperienceSession(
      experienceDefinition,
      'Mara',
      'wits',
      context(),
    );
    const rolled = resolveAction(
      experienceDefinition,
      initial,
      {
        operationId: 'book_action_commit',
        expectedRevision: initial.revision,
        targetId: 'search_hearth',
        approach: 'wits',
        intent: 'Search the dying hearth.',
      },
      14,
      context(),
    ).session;
    const pending = rolled.pendingResolution!;
    const written = commitNarration(
      experienceDefinition,
      rolled,
      {
        operationId: 'book_write',
        expectedRevision: rolled.revision,
        resolutionId: pending.resolutionId,
        representedEventIds: pending.representedEventIds,
        payload: {
          format: 'prose',
          text: 'Mara searched beneath the hearth and found the warm Charred Key while the raven counted the first bell from the rafters above.',
        },
      },
      context(),
    ).session;
    const leaf = buildBookLeaves(written)[2];
    expect(leaf.kind).toBe('completed');
    expect(leaf.entry?.payload).toMatchObject({
      format: 'prose',
      text: expect.stringContaining('Charred Key'),
    });
    expect(latestBookLeafIndex(written)).toBe(2);
  });

  it('marks the final committed leaf as the ending page', () => {
    const session = createExperienceSession(
      experienceDefinition,
      'Vera',
      'wits',
      context(),
    );
    const finalResolution = {
      resolutionId: 'resolution_final',
      actionId: 'speak_the_true_name',
      intent: 'Speak the complete true name.',
      turn: 6,
      createdAt: 1_700_000_000_000,
      roll: {
        die: 18,
        attribute: 'wits' as const,
        modifier: 2,
        total: 20,
        dc: 15,
        tier: 'success' as const,
      },
      canonicalEvents: [
        {
          id: 'ending_true_name',
          type: 'ending' as const,
          label: 'The True Name',
          detail: 'The house releases its keeper.',
        },
      ],
      representedEventIds: ['ending_true_name'],
      mustInclude: [],
      mustNotClaim: [],
      newAbilityIds: [],
    };
    session.turn = 6;
    session.clock = 6;
    session.phase = 'COMPLETE';
    session.endingId = 'true_name';
    session.narrationEntries.push({
      id: 'entry_final',
      turn: 6,
      payload: {
        format: 'prose',
        text: 'Vera spoke the true name, and the locked house opened at last.',
      },
      createdAt: 1_700_000_000_001,
      resolution: finalResolution,
    });

    expect(buildBookLeaves(session)[7]).toMatchObject({
      kind: 'completed',
      turn: 6,
      endingId: 'true_name',
      title: 'The True Name',
    });
  });
});
