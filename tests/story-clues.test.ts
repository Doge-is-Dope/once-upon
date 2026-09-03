import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { StoryClues } from '../components/frames/desk/story-clues';
import { createExperienceSession } from '../lib/runtime/engine';
import type { ExperienceSession } from '../lib/runtime/types';
import { testContext } from './helpers';
import { recordFixtureExperience } from './support/fixture-story';

describe('story clues markup', () => {
  it('renders only the two already-observed prologue clues', () => {
    const html = render(
      createExperienceSession(recordFixtureExperience, testContext()),
    );

    expect(html).toContain('aria-label="Open clue notebook"');
    expect(html).toContain('>Notes</span>');
    expect(html).toContain('class="story-clues-binding"');
    expect(html).not.toContain('new note available');
    expect(html).toContain('Notes · 2 found');
    expect(html).toContain('Things I noticed');
    expect(occurrences(html, '>Noted</span>')).toBe(2);
    expect(html).not.toContain('>New</span>');
    expect(html).not.toContain('The Key');
    expect(html).not.toContain('Try this');
    expect(html).not.toContain('open_the_drawer');
    expect(html).not.toContain('key_found');
    expect(html).not.toContain('×');
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

    expect(html).toContain('Notes · 3 found');
    expect(html).toContain(
      'aria-label="Open clue notebook, new note available"',
    );
    expect(html).toContain('data-new="true"');
    expect(html).toContain('The Key');
    expect(html).toContain('>New</span>');
    expect(html).toContain('→ Try this');
    expect(html).not.toContain('key_found');
    expect(html).not.toContain('drawer_note');
    expect(html).not.toContain('Do not answer yet');
  });
});

function render(session: ExperienceSession): string {
  return renderToStaticMarkup(
    createElement(StoryClues, {
      experience: recordFixtureExperience,
      onAnnounce: () => undefined,
      onOpenChange: () => undefined,
      open: false,
      session,
    }),
  );
}

function occurrences(value: string, needle: string): number {
  return value.split(needle).length - 1;
}
