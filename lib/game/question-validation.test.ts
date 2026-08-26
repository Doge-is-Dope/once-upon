import { describe, expect, it } from 'vitest';
import { normalizeQuestionText, validateQuestionDrafts } from './question-validation';

const validQuestion = {
  prompt: 'Which tiny adventure sounds best right now?',
  options: ['Sunrise walk', 'Mystery snack', 'Wrong train', 'Rooftop chat'],
};

describe('question validation', () => {
  it('accepts an exact four-choice plain-text question', () => {
    expect(validateQuestionDrafts([validQuestion], 1, 4)).toEqual([]);
  });

  it('rejects partial Learn batches without side-effect-friendly ambiguity', () => {
    expect(validateQuestionDrafts([validQuestion], 5, 4)).toContainEqual(expect.objectContaining({ code: 'count' }));
  });

  it('rejects duplicate normalized options and prior prompts', () => {
    const issues = validateQuestionDrafts(
      [{ ...validQuestion, options: ['Tea', ' tea ', 'Coffee', 'Water'] }],
      1,
      4,
      ['  WHICH tiny adventure sounds best right now? '],
    );
    expect(issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(['duplicate', 'duplicate']));
  });

  it('rejects URLs, markup, and multiline content', () => {
    const issues = validateQuestionDrafts([{ prompt: 'Visit https://example.com?\nNow?', options: ['<b>A</b>', 'B', 'C', 'D'] }], 1, 4);
    expect(issues.map((issue) => issue.code)).toContain('plain_text');
    expect(issues.map((issue) => issue.code)).toContain('single_line');
  });

  it('rejects markdown and control characters', () => {
    const issues = validateQuestionDrafts(
      [{ prompt: '**Which choice** feels right?', options: ['One', 'Two', 'Three', 'Four\u0007'] }],
      1,
      4,
    );
    expect(issues.filter((issue) => issue.code === 'plain_text')).toHaveLength(2);
  });

  it('normalizes whitespace deterministically', () => {
    expect(normalizeQuestionText('  One   small\n question? ')).toBe('One small question?');
  });
});
