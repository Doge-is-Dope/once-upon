import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BackspaceText } from '../components/frames/book/backspace-text';

describe('backspace replacement', () => {
  it('keeps the animation visual separate from one clean accessible result', () => {
    const html = renderToStaticMarkup(
      createElement(BackspaceText, {
        original: 'You keep walking.',
        replacement: 'The subject continues walking.',
      }),
    );

    expect(html).toContain('class="backspace-replacement"');
    expect(html).toContain('You keep walking.');
    expect(html).toContain(
      '<span class="sr-only">The subject continues walking.</span>',
    );
    expect(html).not.toContain('<del>');
    expect(html).not.toContain('<ins>');
  });
});
