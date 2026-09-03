import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/frames/registry', () => ({
  renderExperienceFrame: () => null,
}));

import { ExperienceApp, isMobileBrowser } from '@/components/experience-app';

describe('experience support gate', () => {
  it('server-renders only the safe static restriction screen', () => {
    const html = renderToStaticMarkup(
      createElement(ExperienceApp, {
        experienceId: 'the-last-manuscript',
      }),
    );

    expect(html).toContain('data-support-restricted="true"');
    expect(html).toContain('Access restricted');
    expect(html).toContain('webmcp-availability-copy');
    expect(html).not.toContain('data-webmcp-availability');
    expect(html).not.toContain('frame-book');
    expect(html).not.toContain('<button');
    expect(html).not.toContain('<a ');
  });

  it('uses UA-CH mobile when available', () => {
    expect(
      isMobileBrowser({
        userAgent: 'Desktop browser',
        userAgentData: { mobile: true },
      }),
    ).toBe(true);
    expect(
      isMobileBrowser({
        userAgent: 'iPhone Mobile',
        userAgentData: { mobile: false },
      }),
    ).toBe(false);
  });

  it('falls back to mobile UA detection without pointer heuristics', () => {
    expect(
      isMobileBrowser({
        userAgent: 'Mozilla/5.0 (iPhone) Mobile',
      }),
    ).toBe(true);
    expect(isMobileBrowser({ userAgent: 'Mozilla/5.0 (Macintosh)' })).toBe(
      false,
    );
  });
});
