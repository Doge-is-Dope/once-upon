import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { StoryHint } from '../components/frames/book/story-hint';

describe('StoryHint', () => {
  it('renders an illuminated disclosure without menu or dialog semantics', () => {
    const html = renderToStaticMarkup(
      createElement(StoryHint, { hint: 'Follow the torn edge.' }),
    );

    expect(html).toContain('aria-label="Hint"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('data-available="true"');
    expect(html).toContain('Follow the torn edge.');
    expect(html).not.toContain('<details');
    expect(html).not.toContain('role="menu"');
    expect(html).not.toContain('role="dialog"');
  });
});
