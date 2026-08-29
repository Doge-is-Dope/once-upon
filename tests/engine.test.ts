import { describe, expect, it } from 'vitest';
import {
  createSession,
  resolveAction,
  toAdventureState,
  writeManuscript,
  type EngineContext,
} from '../lib/game/engine';
import type { ActionInput, GameSession, ToolSuccess } from '../lib/game/types';

function context(): EngineContext {
  let sequence = 0;
  return {
    now: () => 1_700_000_000_000 + sequence,
    id: (prefix) => `${prefix}_test_${++sequence}`,
  };
}

function action(
  session: GameSession,
  targetId: string,
  operationId: string,
  die = 18,
) {
  const input: ActionInput = {
    operationId,
    expectedRevision: session.revision,
    targetId,
    approach: 'wits',
    intent: `I choose to ${targetId}.`,
  };
  return resolveAction(session, input, die, context());
}

function narrate(session: GameSession, operationId: string) {
  const pending = session.pendingResolution!;
  return writeManuscript(
    session,
    {
      operationId,
      expectedRevision: session.revision,
      resolutionId: pending.resolutionId,
      representedEventIds: pending.representedEventIds,
      prose:
        'The traveler followed the saved truth through the darkened tavern, accepting every consequence exactly as the page recorded it while the clock moved closer to its final bell.',
    },
    context(),
  );
}

describe('The Last Manuscript engine', () => {
  it('starts with the chosen strength and two authored items', () => {
    const session = createSession('Mara', 'nerve', context());
    expect(session.stats).toEqual({ wits: 1, nerve: 2, grace: 1 });
    expect(session.inventoryIds).toEqual([
      'lit_tin_lantern',
      'half_burnt_letter',
    ]);
    expect(session.phase).toBe('READY_FOR_ACTION');
    expect(toAdventureState(session).requiredNextTool).toBe(
      'perform_action_or_unlocked_ability',
    );
  });

  it('saves one roll and blocks every new action until narration', () => {
    const initial = createSession('', 'wits', context());
    const first = action(initial, 'search_hearth', 'action_0001', 14);
    expect(first.session.phase).toBe('AWAITING_MANUSCRIPT');
    expect(first.session.inventoryIds).toContain('charred_key');
    expect(first.session.pendingResolution?.roll.die).toBe(14);

    const blocked = resolveAction(
      first.session,
      {
        operationId: 'action_0002',
        expectedRevision: first.session.revision,
        targetId: 'search_upstairs_room',
        approach: 'wits',
        intent: 'Search upstairs.',
      },
      20,
      context(),
    );
    expect(blocked.response).toMatchObject({
      ok: false,
      code: 'NARRATION_REQUIRED',
    });
    expect(blocked.session.revision).toBe(first.session.revision);
    expect(blocked.session.pendingResolution?.roll.die).toBe(14);
  });

  it('replays an identical operation without advancing or changing the roll', () => {
    const initial = createSession('', 'wits', context());
    const input = {
      operationId: 'action_repeat',
      expectedRevision: initial.revision,
      targetId: 'search_hearth',
      approach: 'wits' as const,
      intent: 'Search the hearth.',
    };
    const first = resolveAction(initial, input, 9, context());
    const retry = resolveAction(first.session, input, 20, context());
    expect(retry.response).toMatchObject({ ok: true, idempotentReplay: true });
    expect((retry.response as ToolSuccess).resolution?.roll.die).toBe(9);
    expect(retry.session.revision).toBe(first.session.revision);
    expect(retry.session.clock).toBe(1);
  });

  it('commits only the exact pending receipt and returns the next state', () => {
    const rolled = action(
      createSession('', 'wits', context()),
      'search_hearth',
      'action_0003',
    );
    const written = narrate(rolled.session, 'write_0003');
    expect(written.response).toMatchObject({ ok: true });
    expect(written.session.phase).toBe('READY_FOR_ACTION');
    expect(written.session.pendingResolution).toBeNull();
    expect(written.session.manuscript).toHaveLength(2);
    expect((written.response as ToolSuccess).state.revision).toBe(
      written.session.revision,
    );
  });

  it('keeps critical progress on a low roll while applying its cost', () => {
    const rolled = action(
      createSession('', 'wits', context()),
      'search_upstairs_room',
      'action_lowroll',
      1,
    );
    expect(rolled.session.inventoryIds).toContain('black_mirror_shard');
    expect(rolled.session.unlockedAbilityIds).toContain('reveal_hidden_ink');
    expect(rolled.session.resolve).toBe(2);
    expect(rolled.session.pendingResolution?.roll.tier).toBe(
      'critical_setback',
    );
  });

  it('completes the six-turn True Name route and gives that ending priority', () => {
    let session = createSession('Vera', 'wits', context());
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
      const written = narrate(rolled.session, `write_route_${index}`);
      session = written.session;
    });
    expect(session.turn).toBe(6);
    expect(session.clock).toBe(6);
    expect(session.endingId).toBe('true_name');
    expect(session.phase).toBe('COMPLETE');
    expect(session.clueIds).toEqual(
      expect.arrayContaining(['first_name_fragment', 'second_name_fragment']),
    );
  });

  it('rejects stale revisions without rolling or advancing', () => {
    const session = createSession('', 'grace', context());
    let rolls = 0;
    const result = resolveAction(
      session,
      {
        operationId: 'action_stale',
        expectedRevision: 999,
        targetId: 'search_hearth',
        approach: 'grace',
        intent: 'Search.',
      },
      () => {
        rolls += 1;
        return 20;
      },
      context(),
    );
    expect(result.response).toMatchObject({ ok: false, code: 'STALE_STATE' });
    expect(result.session).toBe(session);
    expect(result.session.clock).toBe(0);
    expect(rolls).toBe(0);
  });
});
