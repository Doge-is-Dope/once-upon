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
    const first = controller.beginStoryTurn({
      operationId: operationId('first'),
      expectedSessionId: initial.sessionId,
      expectedRevision: initial.revision,
      playerChoice: 'I inspect the table.',
    });
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
  });

  it('keeps committed work and serves an idempotent retry', async () => {
    const initial = createExperienceSession(
      experienceDefinition,
      testContext(),
    );
    const controller = new ExperienceController(experienceDefinition, initial);
    const input = {
      operationId: operationId('committed'),
      expectedSessionId: initial.sessionId,
      expectedRevision: initial.revision,
      playerChoice: 'I inspect the wardrobe.',
    };
    const committed = await controller.beginStoryTurn(input);
    expect(committed).toMatchObject({ ok: true });
    const revision = controller.getSnapshot().revision;

    const retry = await controller.beginStoryTurn(input);
    expect(retry).toMatchObject({ ok: true, idempotentReplay: true });
    expect(controller.getSnapshot().revision).toBe(revision);
  });
});
