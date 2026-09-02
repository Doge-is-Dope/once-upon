import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { StoryClues } from '../components/frames/book/story-clues';
import { experienceDefinition } from '../experiences/the-last-manuscript/definition';
import { createExperienceSession } from '../lib/runtime/engine';
import type { ExperienceSession } from '../lib/runtime/types';
import { testContext } from './helpers';

describe('story clues markup', () => {
  it('renders only the two already-observed prologue clues', () => {
    const html = render(
      createExperienceSession(experienceDefinition, testContext()),
    );

    expect(html).toContain('aria-label="Open clue notebook"');
    expect(html).toContain('>Notes</span>');
    expect(html).toContain('class="story-clues-binding"');
    expect(html).not.toContain('new note available');
    expect(html).toContain('Notes from the room · 2 found');
    expect(html).toContain('Things I noticed');
    expect(occurrences(html, '>Noted</span>')).toBe(2);
    expect(html).not.toContain('>New</span>');
    expect(html).not.toContain('The Pencil');
    expect(html).not.toContain('Try this');
    expect(html).not.toContain('reveal_pressed_words');
    expect(html).not.toContain('pencil_found');
    expect(html).not.toContain('×');
  });

  it('adds a discovered clue as New without rendering its internal ID', () => {
    const initial = createExperienceSession(
      experienceDefinition,
      testContext(),
    );
    const discovered: ExperienceSession = {
      ...initial,
      revision: 2,
      discoveries: [
        {
          id: 'pencil_found',
          chapterId: 'chapter_pencil',
          discoveredAt: initial.chapters[0]!.createdAt + 1,
        },
      ],
    };
    const html = render(discovered);

    expect(html).toContain('Notes from the room · 3 found');
    expect(html).toContain(
      'aria-label="Open clue notebook, new note available"',
    );
    expect(html).toContain('data-new="true"');
    expect(html).toContain('The Pencil');
    expect(html).toContain('>New</span>');
    expect(html).toContain('→ Try this');
    expect(html).not.toContain('pencil_found');
    expect(html).not.toContain('sixth_attempt_note');
    expect(html).not.toContain('Sixth time');
  });
});

function render(session: ExperienceSession): string {
  return renderToStaticMarkup(
    createElement(StoryClues, {
      experience: experienceDefinition,
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
