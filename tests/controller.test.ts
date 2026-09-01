import { describe, expect, it } from 'vitest';
import { ExperienceController } from '../lib/runtime/controller';
import { createExperienceSession } from '../lib/runtime/engine';
import { experienceDefinition } from '../experiences/the-last-manuscript/definition';
import { operationId, testContext } from './helpers';

describe('in-memory experience controller', () => {
  it('cancels queued work before the synchronous commit point', async () => {
    const initial = createExperienceSession(
      experienceDefinition,
      testContext(),
    );
    const controller = new ExperienceController(experienceDefinition, initial);
    const firstInput = {
      operationId: operationId('first'),
      expectedSessionId: initial.sessionId,
      expectedRevision: initial.revision,
      playerChoice: 'I inspect the table.',
    };
    const first = controller.beginStoryTurn(firstInput);
    const cancelled = new AbortController();
    const second = controller.beginStoryTurn(
      {
        operationId: operationId('second'),
        expectedSessionId: initial.sessionId,
        expectedRevision: initial.revision,
        playerChoice: 'I inspect the door.',
      },
      cancelled.signal,
    );
    cancelled.abort();

    await expect(first).resolves.toMatchObject({ ok: true });
    await expect(second).rejects.toMatchObject({ name: 'AbortError' });
    expect(controller.getSnapshot().revision).toBe(initial.revision + 1);
    expect(controller.getSnapshot().pendingTurn?.playerChoice).toBe(
      'I inspect the table.',
    );
    const revision = controller.getSnapshot().revision;

    const retry = await controller.beginStoryTurn(firstInput);
    expect(retry).toMatchObject({ ok: true, idempotentReplay: true });
    expect(controller.getSnapshot().revision).toBe(revision);
  });
});
