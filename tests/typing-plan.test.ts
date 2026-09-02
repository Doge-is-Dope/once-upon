import { describe, expect, it } from 'vitest';
import {
  buildTypingPlan,
  describeTypingSeconds,
  estimateTypingMs,
  splitTypingTokens,
} from '../lib/manuscript/typing-plan';

describe('typing plan', () => {
  it('tokenizes without losing characters', () => {
    const text = 'You  follow the choice.\nThen wait.';
    expect(splitTypingTokens(text).join('')).toBe(text);
  });

  it('schedules words in order and reports a total the page and agent share', () => {
    const plan = buildTypingPlan(
      'A pencil',
      ['You follow the choice. It waits.', 'The lamp hums.'],
      [],
    );
    const starts = [...plan.title, ...plan.paragraphs.flat()].map(
      ({ start }) => start,
    );
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
    expect(plan.total).toBeGreaterThan(starts.at(-1)!);
    expect(
      estimateTypingMs(
        'A pencil',
        'You follow the choice. It waits.\n\nThe lamp hums.',
      ),
    ).toBe(plan.total);
  });

  it('keeps a three-paragraph chapter within a reading pace', () => {
    const paragraph =
      'You follow the choice through the quiet room and keep each physical detail in view. The wall speaker waits while the notepad, wardrobe, and handleless door remain where you left them.';
    const ms = estimateTypingMs(
      'A title',
      [paragraph, paragraph, paragraph].join('\n\n'),
    );
    expect(ms).toBeLessThan(16_000);
    expect(describeTypingSeconds(ms)).toBe(Math.ceil(ms / 1000));
  });

  it('adds the completion passage to the final estimate', () => {
    const chapterOnly = estimateTypingMs('End', 'You stop.');
    const withEnding = estimateTypingMs(
      'End',
      'You stop.',
      'You walk out into the rain.',
    );
    expect(withEnding).toBeGreaterThan(chapterOnly);
  });
});
