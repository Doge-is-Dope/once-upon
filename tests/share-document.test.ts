import { describe, expect, it } from 'vitest';
import { experienceDefinition } from '../experiences/the-last-manuscript/definition';
import {
  ShareValidationError,
  validateSharedStorySubmission,
} from '../lib/share/document';

const requestId = 'd10cbb0f-b6f4-4d61-8cc5-1bf893f12431';

function completeSubmission() {
  return {
    version: 1,
    requestId,
    experienceId: experienceDefinition.id,
    storyId: experienceDefinition.story.id,
    status: 'COMPLETE',
    chapters: [
      {
        title: experienceDefinition.story.prologue.title,
        prose: experienceDefinition.story.prologue.prose,
        effectInteractionId: null,
      },
      {
        title: 'The pressed page',
        prose: 'The pencil reveals the marks without changing their words.',
        effectInteractionId: 'pressed_writing',
      },
      {
        title: 'The memory',
        prose:
          'You open your eyes in the same room after the sequence returns.',
        effectInteractionId: 'north_station_memory',
      },
      {
        title: 'The last page',
        prose: '<script>alert("never rendered as markup")</script>',
        effectInteractionId: 'last_manuscript',
      },
    ],
  };
}

describe('shared story validation', () => {
  it('rebuilds canonical effects and preserves prose as text', () => {
    const validated = validateSharedStorySubmission(
      completeSubmission(),
      Date.UTC(2026, 7, 31),
    );
    expect(
      validated.document.chapters.map(({ effect }) => effect?.title),
    ).toEqual([
      undefined,
      'The Pencil',
      'The North Station Memory',
      'The Last Manuscript',
    ]);
    expect(validated.document.chapters.at(-1)?.prose).toEqual([
      '<script>alert("never rendered as markup")</script>',
    ]);
    expect(validated.document.expiresAt).toBe('2026-09-30T00:00:00.000Z');
    expect(JSON.stringify(validated.document)).not.toMatch(
      /requestId|interactionId|sessionId|receiptId/,
    );
  });

  it('rejects incomplete, reordered, extra-field, and non-complete payloads', () => {
    const reordered = completeSubmission();
    reordered.chapters[1].effectInteractionId = 'north_station_memory';
    expect(() => validateSharedStorySubmission(reordered, 0)).toThrow(
      ShareValidationError,
    );

    const incomplete = completeSubmission();
    incomplete.chapters.pop();
    expect(() => validateSharedStorySubmission(incomplete, 0)).toThrow(
      /incomplete or out of order/,
    );

    const extra = { ...completeSubmission(), internalSessionId: 'secret' };
    expect(() => validateSharedStorySubmission(extra, 0)).toThrow(
      /Unexpected or missing fields/,
    );

    const running = { ...completeSubmission(), status: 'READY' };
    expect(() => validateSharedStorySubmission(running, 0)).toThrow(
      /Only completed stories/,
    );
  });
});
