import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  headerTitleAnimation,
  StoryHeaderTitle,
} from '../components/frames/book/story-header-title';

describe('StoryHeaderTitle', () => {
  it('renders a visual-only title with reusable animation variables', () => {
    const html = renderToStaticMarkup(
      createElement(StoryHeaderTitle, { title: 'The Last Manuscript' }),
    );

    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('The Last Manuscript');
    expect(html).toContain('--header-title-characters:19');
    expect(html).toContain('--header-title-duration:855ms');
  });

  it('counts Unicode code points when deriving the animation duration', () => {
    expect(headerTitleAnimation('A 🕯')).toEqual({
      characterCount: 3,
      durationMs: 135,
    });
    expect(headerTitleAnimation('x'.repeat(100))).toEqual({
      characterCount: 100,
      durationMs: 4500,
    });
  });
});
