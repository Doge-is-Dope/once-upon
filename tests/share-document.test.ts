import { describe, expect, it } from 'vitest';
import { experienceDefinition } from '../experiences/the-last-manuscript/definition';
import {
  parseSharedStoryDocument,
  ShareValidationError,
  validateSharedStorySubmission,
} from '../lib/share/document';

const requestId = 'd10cbb0f-b6f4-4d61-8cc5-1bf893f12431';

function completeSubmission() {
  return {
    version: 2,
    requestId,
    experienceId: experienceDefinition.id,
    storyId: experienceDefinition.story.id,
    status: 'COMPLETE',
    chapters: [
      {
        title: experienceDefinition.story.prologue.title,
        prose: experienceDefinition.story.prologue.prose,
        recordProse: experienceDefinition.story.prologue.recordProse,
        effectInteractionId: null,
      },
      {
        title: 'The pressed page',
        prose: 'The pencil reveals the marks without changing their words.',
        recordProse:
          'The pencil reveals the marks without changing their words.',
        effectInteractionId: 'pressed_writing',
      },
      {
        title: 'The memory',
        prose:
          'You open your eyes in the same room after the sequence returns.',
        recordProse:
          'The subject opens their eyes in the same room after the sequence returns.',
        effectInteractionId: 'north_station_memory',
      },
      {
        title: 'The last page',
        prose: '<script>alert("never rendered as markup")</script>',
        recordProse: '<script>alert("never rendered as markup")</script>',
        effectInteractionId: 'last_manuscript',
      },
    ],
    completionPassage: experienceDefinition.story.completionPassage,
  };
}

describe('shared story validation', () => {
  it('continues to read stored v1 documents without rewriting them', () => {
    const legacy = {
      version: 1,
      title: 'A legacy manuscript',
      createdAt: '2026-08-01T00:00:00.000Z',
      expiresAt: '2026-09-01T00:00:00.000Z',
      chapters: [
        {
          label: 'Prologue',
          title: 'The old page',
          prose: ['You remain exactly as the original link recorded you.'],
          effect: null,
        },
      ],
    };

    expect(parseSharedStoryDocument(JSON.stringify(legacy))).toEqual(legacy);
  });

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
    expect(validated.document.version).toBe(2);
    expect(validated.document.completionPassage.recordProse).toEqual(
      expect.arrayContaining([
        expect.stringContaining('The subject continues walking.'),
      ]),
    );
    expect(validated.document.expiresAt).toBe('2026-09-30T00:00:00.000Z');
    expect(JSON.stringify(validated.document)).not.toMatch(
      /requestId|interactionId|sessionId|receiptId/,
    );
  });

  it('rejects malformed official prose', () => {
    const secondPerson = completeSubmission();
    secondPerson.chapters[2]!.recordProse =
      'You open your eyes in the same room after the sequence returns.';
    expect(() => validateSharedStorySubmission(secondPerson, 0)).toThrow(
      /second-person pronoun/,
    );

    const paragraphMismatch = completeSubmission();
    paragraphMismatch.chapters[2]!.recordProse += '\n\nA second paragraph.';
    expect(() => validateSharedStorySubmission(paragraphMismatch, 0)).toThrow(
      /same paragraph structure/,
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
