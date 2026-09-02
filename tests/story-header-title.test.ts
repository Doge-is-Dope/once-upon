import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { StoryHeaderTitle } from '../components/frames/desk/story-header-title';

describe('StoryHeaderTitle', () => {
  it('bridges a Unicode-safe character count into CSS animation variables', () => {
    const html = renderToStaticMarkup(
      createElement(StoryHeaderTitle, { title: 'A 🕯' }),
    );

    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('A 🕯');
    expect(html).toContain('--header-title-characters:3');
    expect(html).toContain('--header-title-duration:135ms');
  });
});
