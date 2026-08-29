import { describe, expect, it } from 'vitest';
import {
  commitNarration,
  createExperienceSession,
  resolveAction,
  toStoryState,
} from '../lib/runtime/engine';
import type { ExperienceSession } from '../lib/runtime/types';
import { experienceDefinition } from '../experiences/the-last-manuscript/definition';
import { testContext } from './fixtures';

function action(
  session: ExperienceSession,
  targetId: string,
  operationId: string,
  die = 18,
) {
  return resolveAction(
    experienceDefinition,
    session,
    {
      operationId,
      expectedRevision: session.revision,
      targetId,
      approach: 'wits',
      intent: `I choose to ${targetId}.`,
    },
    die,
    testContext(),
  );
}

function narrate(session: ExperienceSession, operationId: string) {
  const pending = session.pendingResolution!;
  return commitNarration(
    experienceDefinition,
    session,
    {
      operationId,
      expectedRevision: session.revision,
      resolutionId: pending.resolutionId,
      representedEventIds: pending.representedEventIds,
      payload: {
        format: 'prose',
        text: 'The traveler follows the saved truth through the darkened tavern, accepting every consequence exactly as the page recorded it while the clock moves closer to its final bell.',
      },
    },
    testContext(),
  );
}

describe('The Last Manuscript experience', () => {
  it('starts with the chosen strength and authored opening state', () => {
    const session = createExperienceSession(
      experienceDefinition,
      'Mara',
      'nerve',
      testContext(),
    );
    expect(session.stats).toEqual({ wits: 1, nerve: 2, grace: 1 });
    expect(session.inventoryIds).toEqual([
      'lit_tin_lantern',
      'half_burnt_letter',
    ]);
    expect(toStoryState(experienceDefinition, session).location.id).toBe(
      'main_hall',
    );
  });

  it('keeps critical progress on a low roll while applying its cost', () => {
    const session = createExperienceSession(
      experienceDefinition,
      '',
      'wits',
      testContext(),
    );
    const rolled = action(session, 'search_upstairs_room', 'action_lowroll', 1);
    expect(rolled.session.inventoryIds).toContain('black_mirror_shard');
    expect(rolled.session.unlockedAbilityIds).toContain('reveal_hidden_ink');
    expect(rolled.session.resolve).toBe(2);
    expect(rolled.session.pendingResolution?.roll.tier).toBe(
      'critical_setback',
    );
  });

  it('completes the six-turn True Name route and gives that ending priority', () => {
    let session = createExperienceSession(
      experienceDefinition,
      'Vera',
      'wits',
      testContext(),
    );
    const route = [
      'search_hearth',
      'search_upstairs_room',
      'reveal_hidden_ink',
      'offer_charred_key_to_raven',
      'ask_the_raven',
      'speak_the_true_name',
    ];
    route.forEach((targetId, index) => {
      const rolled = action(session, targetId, `action_route_${index}`, 18);
      expect(rolled.response).toMatchObject({ ok: true });
      session = narrate(rolled.session, `narration_route_${index}`).session;
    });
    expect(session).toMatchObject({
      turn: 6,
      clock: 6,
      endingId: 'true_name',
      phase: 'COMPLETE',
    });
    expect(session.clueIds).toEqual(
      expect.arrayContaining(['first_name_fragment', 'second_name_fragment']),
    );
  });
});
