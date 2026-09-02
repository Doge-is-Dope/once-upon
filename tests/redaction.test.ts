import { describe, expect, it } from 'vitest';
import { redactParagraphs } from '../lib/manuscript/redaction';

const paragraphs = [
  '"Please answer: what happened at North Station at 5:41 p.m. on May twelfth?"',
  'The question hangs in the room. On the desk is an open notebook.',
  'The speaker calls it North Station. You cannot remember it.',
  'The ventilation rattles, then falls still.',
];

describe('redaction', () => {
  it('keeps the speaker question legible and inks over the last paragraph', () => {
    const runs = redactParagraphs(paragraphs);
    expect(runs[0]).toEqual([{ text: paragraphs[0], redacted: false }]);
    expect(runs.at(-1)).toEqual([{ text: paragraphs[3], redacted: true }]);
  });

  it('leaves an uneven lead of words before each bar', () => {
    const runs = redactParagraphs(paragraphs);
    expect(runs[1].map((run) => run.text)).toEqual([
      'The question hangs in ',
      'the room. On the desk is an open notebook.',
    ]);
    expect(runs[1].map((run) => run.redacted)).toEqual([false, true]);
    expect(runs[2][0].text).toBe('The speaker calls ');
    expect(runs[2][1].redacted).toBe(true);
  });

  it('never loses or reorders a character', () => {
    for (const [index, runs] of redactParagraphs(paragraphs).entries()) {
      expect(runs.map((run) => run.text).join('')).toBe(paragraphs[index]);
    }
  });

  it('is deterministic', () => {
    expect(redactParagraphs(paragraphs)).toEqual(redactParagraphs(paragraphs));
  });

  it('inks a paragraph shorter than its lead whole', () => {
    expect(redactParagraphs(['Q?', 'Two words', 'End.'])[1]).toEqual([
      { text: 'Two words', redacted: true },
    ]);
  });
});
