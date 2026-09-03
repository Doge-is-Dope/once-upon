import { describe, expect, it } from 'vitest';
import {
  parseSharedStoryDocument,
  ShareValidationError,
  validateSharedStorySubmission,
} from '@/lib/share/document';
import {
  lookupFixtureExperience,
  makeCompleteShareSubmission,
} from './support/share-fixtures';

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
      makeCompleteShareSubmission(),
      Date.UTC(2026, 7, 31),
      lookupFixtureExperience,
    );
    expect(
      validated.document.chapters.map(({ effect }) => effect?.title),
    ).toEqual([undefined, 'The Drawer', 'The Memory', 'The Wall Panel']);
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
    const secondPerson = makeCompleteShareSubmission();
    secondPerson.chapters[2]!.recordProse =
      'You follow the memory and wait for what it changes.';
    expect(() =>
      validateSharedStorySubmission(secondPerson, 0, lookupFixtureExperience),
    ).toThrow(/second-person pronoun/);

    const paragraphMismatch = makeCompleteShareSubmission();
    paragraphMismatch.chapters[2]!.recordProse += '\n\nA second paragraph.';
    expect(() =>
      validateSharedStorySubmission(
        paragraphMismatch,
        0,
        lookupFixtureExperience,
      ),
    ).toThrow(/same paragraph structure/);
  });

  it('rejects incomplete, reordered, extra-field, and non-complete payloads', () => {
    const reordered = makeCompleteShareSubmission();
    reordered.chapters[1]!.effectInteractionId = 'memory';
    expect(() =>
      validateSharedStorySubmission(reordered, 0, lookupFixtureExperience),
    ).toThrow(ShareValidationError);

    const incomplete = makeCompleteShareSubmission();
    incomplete.chapters.pop();
    expect(() =>
      validateSharedStorySubmission(incomplete, 0, lookupFixtureExperience),
    ).toThrow(/incomplete or out of order/);

    const extra = {
      ...makeCompleteShareSubmission(),
      internalSessionId: 'secret',
    };
    expect(() =>
      validateSharedStorySubmission(extra, 0, lookupFixtureExperience),
    ).toThrow(/Unexpected or missing fields/);

    const running = { ...makeCompleteShareSubmission(), status: 'READY' };
    expect(() =>
      validateSharedStorySubmission(running, 0, lookupFixtureExperience),
    ).toThrow(/Only completed stories/);
  });
});
