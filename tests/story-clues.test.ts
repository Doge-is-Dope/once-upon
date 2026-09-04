import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  StoryClues,
  StoryCluesTrigger,
} from '@/components/frames/desk/story-clues';
import { resolveBookCopy } from '@/lib/frames/book';
import { derivePlayerClues } from '@/lib/manuscript/clue-journal';
import { createExperienceSession } from '@/lib/runtime/engine';
import type { ExperienceSession } from '@/lib/runtime/types';
import { testContext } from './helpers';
import { recordFixtureExperience } from './support/fixture-story';

const prologueClueIds = new Set(
  recordFixtureExperience.story.clues
    .filter(({ revealedBy }) => revealedBy.kind === 'prologue')
    .map(({ id }) => id),
);

describe('story clues markup', () => {
  it('renders only the two already-observed prologue clues', () => {
    const html = render(
      createExperienceSession(recordFixtureExperience, testContext()),
    );

    expect(occurrences(html, 'class="story-clue-entry"')).toBe(2);
    expect(html).toContain('Things I noticed');
    expect(occurrences(html, '>Noted</span>')).toBe(2);
    expect(html).not.toContain('>New</span>');
    expect(html).not.toContain('The Key');
    expect(html).not.toContain('Try this');
    expect(html).not.toContain('open_the_drawer');
    expect(html).not.toContain('key_found');
    expect(html).not.toContain('×');
  });

  it('keeps the notebook empty until a chapter has been written', () => {
    const html = render(
      createExperienceSession(recordFixtureExperience, testContext()),
      { available: false },
    );

    expect(html).toContain('Things I noticed');
    expect(html).not.toContain('story-clue-entry');
    expect(html).not.toContain('story-clue-entry');
    expect(html).not.toContain('>Noted</span>');
  });

  it('adds a discovered clue as New without rendering its internal ID', () => {
    const initial = createExperienceSession(
      recordFixtureExperience,
      testContext(),
    );
    const discovered: ExperienceSession = {
      ...initial,
      revision: 2,
      discoveries: [
        {
          id: 'key_found',
          chapterId: 'chapter_key',
          discoveredAt: initial.chapters[0]!.createdAt + 1,
        },
      ],
    };
    const html = render(discovered);

    expect(occurrences(html, 'class="story-clue-entry"')).toBe(3);
    expect(html).toContain('data-new="true"');
    expect(html).toContain('The Key');
    expect(html).toContain('>New</span>');
    expect(html).toContain('story-clue-circle');
    expect(html).not.toContain('Try this');
    expect(html).not.toContain('key_found');
    expect(html).not.toContain('drawer_note');
    expect(html).not.toContain('Do not answer yet');
  });

  it('labels the header key by whether a new note is waiting', () => {
    const quiet = renderToStaticMarkup(
      createElement(StoryCluesTrigger, {
        hasNewClues: false,
        onToggle: () => undefined,
        open: false,
      }),
    );
    expect(quiet).toContain('aria-label="Open clue notebook"');
    expect(quiet).toContain('aria-controls="desk-rail"');
    expect(quiet).toContain('>Notes</span>');
    expect(quiet).not.toContain('new note available');

    const waiting = renderToStaticMarkup(
      createElement(StoryCluesTrigger, {
        hasNewClues: true,
        onToggle: () => undefined,
        open: true,
      }),
    );
    expect(waiting).toContain(
      'aria-label="Open clue notebook, new note available"',
    );
    expect(waiting).toContain('aria-expanded="true"');
    expect(waiting).toContain('>New</span>');
  });
});

function render(
  session: ExperienceSession,
  { available = true }: { available?: boolean } = {},
): string {
  return renderToStaticMarkup(
    createElement(StoryClues, {
      acknowledgedClueIds: prologueClueIds,
      available,
      clues: derivePlayerClues(recordFixtureExperience, session),
      copy: resolveBookCopy(recordFixtureExperience.frame),
    }),
  );
}

function occurrences(value: string, needle: string): number {
  return value.split(needle).length - 1;
}
