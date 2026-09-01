import { describe, expect, it } from 'vitest';
import { diffText } from '../lib/manuscript/text-diff';

describe('record text diff', () => {
  it.each([
    ['You wait.', 'The subject waits.'],
    ['The speaker follows you.', 'The speaker follows the subject.'],
    ['Your coat is wet.', 'The subject’s coat is wet.'],
    ['The choice is yours.', 'The choice belongs to the subject.'],
    ['You steady yourself.', 'The subject steadies themself.'],
    ['“Do you remember?”', '“Does the subject remember?”'],
    ['You wait. You listen.', 'The subject waits. The subject listens.'],
    ['你看見 the door—then wait.', '被觀察者看見 the door—then waits.'],
    ['<script>alert("you")</script>', '<script>alert("the subject")</script>'],
  ])('reconstructs punctuation and Unicode exactly', (original, record) => {
    const runs = diffText(original, record);
    expect(
      runs
        .filter(({ type }) => type !== 'insert')
        .map(({ text }) => text)
        .join(''),
    ).toBe(original);
    expect(
      runs
        .filter(({ type }) => type !== 'delete')
        .map(({ text }) => text)
        .join(''),
    ).toBe(record);
  });

  it('coalesces adjacent tokens into semantic runs', () => {
    expect(
      diffText('You keep walking.', 'The subject continues walking.'),
    ).toEqual([
      { type: 'delete', text: 'You keep ' },
      { type: 'insert', text: 'The subject continues ' },
      { type: 'equal', text: 'walking.' },
    ]);
  });
});
