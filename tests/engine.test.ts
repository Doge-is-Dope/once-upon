import { describe, expect, it } from 'vitest';
import {
  commitNarration,
  createExperienceSession,
  resolveAction,
  toStoryState,
} from '../lib/runtime/engine';
import { TERMINAL_NARRATION_CONTRACT } from '../lib/runtime/narration';
import type {
  ActionInput,
  ExperienceSession,
  ToolSuccess,
} from '../lib/runtime/types';
import { fixtureExperience, testContext, validProse } from './fixtures';

const definition = fixtureExperience();

function action(session: ExperienceSession, operationId: string, die = 18) {
  const input: ActionInput = {
    operationId,
    expectedRevision: session.revision,
    targetId: 'inspect_signal',
    approach: 'focus',
    intent: 'I trace the signal.',
  };
  return resolveAction(definition, session, input, die, testContext());
}

function narrate(session: ExperienceSession, operationId: string) {
  const pending = session.pendingResolution!;
  return commitNarration(
    definition,
    session,
    {
      operationId,
      expectedRevision: session.revision,
      resolutionId: pending.resolutionId,
      representedEventIds: pending.representedEventIds,
      payload: validProse(),
    },
    testContext(),
  );
}

describe('shared experience engine', () => {
  it('creates a versioned session with the selected experience identity', () => {
    const session = createExperienceSession(
      definition,
      'Mara',
      'focus',
      testContext(),
    );
    expect(session).toMatchObject({
      schemaVersion: 2,
      experienceId: 'fixture-alpha',
      storyId: 'signal-station',
      phase: 'READY_FOR_ACTION',
    });
    expect(toStoryState(definition, session).requiredNextTool).toBe(
      'perform_action_or_unlocked_ability',
    );
  });

  it('saves one result and blocks every new action until narration', () => {
    const initial = createExperienceSession(
      definition,
      '',
      'focus',
      testContext(),
    );
    const first = action(initial, 'action_0001', 14);
    expect(first.session.phase).toBe('AWAITING_NARRATION');
    expect(first.session.pendingResolution?.roll.die).toBe(14);

    const blocked = action(first.session, 'action_0002', 20);
    expect(blocked.response).toMatchObject({
      ok: false,
      code: 'NARRATION_REQUIRED',
    });
    expect(blocked.session.revision).toBe(first.session.revision);
  });

  it('replays an identical operation without advancing or changing the roll', () => {
    const initial = createExperienceSession(
      definition,
      '',
      'focus',
      testContext(),
    );
    const input: ActionInput = {
      operationId: 'action_repeat',
      expectedRevision: initial.revision,
      targetId: 'inspect_signal',
      approach: 'focus',
      intent: 'Trace the signal.',
    };
    const first = resolveAction(definition, initial, input, 9, testContext());
    const retry = resolveAction(
      definition,
      first.session,
      input,
      20,
      testContext(),
    );
    expect(retry.response).toMatchObject({ ok: true, idempotentReplay: true });
    expect((retry.response as ToolSuccess).resolution?.roll.die).toBe(9);
    expect(retry.session.revision).toBe(first.session.revision);
  });

  it('commits only the exact pending receipt', () => {
    const initial = createExperienceSession(
      definition,
      '',
      'focus',
      testContext(),
    );
    const rolled = action(initial, 'action_0003');
    const written = narrate(rolled.session, 'narration_0003');
    expect(written.response).toMatchObject({ ok: true });
    expect(written.session.phase).toBe('READY_FOR_ACTION');
    expect(written.session.pendingResolution).toBeNull();
    expect(written.session.narrationEntries).toHaveLength(2);
    expect(written.session.operationLedger.at(-1)?.kind).toBe('narration');
  });

  it('validates both payload variants and does not write a mismatched format', () => {
    const proseInitial = createExperienceSession(
      definition,
      '',
      'focus',
      testContext(),
    );
    const proseRolled = action(proseInitial, 'action_format');
    const rejected = commitNarration(
      definition,
      proseRolled.session,
      {
        operationId: 'narration_wrong_format',
        expectedRevision: proseRolled.session.revision,
        resolutionId: proseRolled.session.pendingResolution!.resolutionId,
        representedEventIds:
          proseRolled.session.pendingResolution!.representedEventIds,
        payload: {
          format: 'terminal',
          lines: [{ kind: 'system', text: 'signal confirmed' }],
        },
      },
      testContext(),
    );
    expect(rejected.response).toMatchObject({
      ok: false,
      code: 'INVALID_INPUT',
    });
    expect(rejected.session.narrationEntries).toHaveLength(1);

    expect(
      TERMINAL_NARRATION_CONTRACT.normalize({
        format: 'terminal',
        lines: [
          { kind: 'command', text: 'scan --frequency' },
          { kind: 'output', text: 'repeating signal confirmed' },
        ],
      }),
    ).toEqual({
      format: 'terminal',
      lines: [
        { kind: 'command', text: 'scan --frequency' },
        { kind: 'output', text: 'repeating signal confirmed' },
      ],
    });

    const terminalDefinition = fixtureExperience(
      'fixture-terminal',
      'terminal',
    );
    const terminalInitial = createExperienceSession(
      terminalDefinition,
      '',
      'focus',
      testContext(),
    );
    const terminalRolled = resolveAction(
      terminalDefinition,
      terminalInitial,
      {
        operationId: 'action_terminal',
        expectedRevision: terminalInitial.revision,
        targetId: 'inspect_signal',
        approach: 'focus',
        intent: 'Scan the signal.',
      },
      15,
      testContext(),
    ).session;
    const terminalWritten = commitNarration(
      terminalDefinition,
      terminalRolled,
      {
        operationId: 'narration_terminal',
        expectedRevision: terminalRolled.revision,
        resolutionId: terminalRolled.pendingResolution!.resolutionId,
        representedEventIds:
          terminalRolled.pendingResolution!.representedEventIds,
        payload: {
          format: 'terminal',
          lines: [
            { kind: 'command', text: 'scan --frequency' },
            { kind: 'output', text: 'repeating signal confirmed' },
          ],
        },
      },
      testContext(),
    );
    expect(terminalWritten.session.narrationEntries.at(-1)?.payload).toEqual({
      format: 'terminal',
      lines: [
        { kind: 'command', text: 'scan --frequency' },
        { kind: 'output', text: 'repeating signal confirmed' },
      ],
    });
  });

  it('rejects stale revisions without rolling or advancing', () => {
    const session = createExperienceSession(
      definition,
      '',
      'composure',
      testContext(),
    );
    let rolls = 0;
    const result = resolveAction(
      definition,
      session,
      {
        operationId: 'action_stale',
        expectedRevision: 999,
        targetId: 'inspect_signal',
        approach: 'composure',
        intent: 'Inspect.',
      },
      () => {
        rolls += 1;
        return 20;
      },
      testContext(),
    );
    expect(result.response).toMatchObject({ ok: false, code: 'STALE_STATE' });
    expect(result.session).toBe(session);
    expect(rolls).toBe(0);
  });
});
