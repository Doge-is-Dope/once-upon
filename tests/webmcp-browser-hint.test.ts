import { describe, expect, it } from 'vitest';
import {
  resolveWebMCPSetupHint,
  type BrowserIdentity,
} from '../components/frames/desk/use-webmcp-connection';

describe('WebMCP browser setup hint', () => {
  it.each([146, 152, 154])(
    'shows the temporary flag hint for desktop Google Chrome %i',
    (version) => {
      expect(resolveWebMCPSetupHint(chromeIdentity(version))).toBe(
        'chrome-flag',
      );
    },
  );

  it.each([145, 155])(
    'falls back outside the documented flag window at Chrome %i',
    (version) => {
      expect(resolveWebMCPSetupHint(chromeIdentity(version))).toBe('generic');
    },
  );

  it.each([
    {
      label: 'Edge',
      identity: {
        userAgent: 'Mozilla/5.0 Chrome/152.0.0.0 Safari/537.36 Edg/152.0.0.0',
        userAgentData: {
          brands: [
            { brand: 'Chromium', version: '152' },
            { brand: 'Microsoft Edge', version: '152' },
          ],
          mobile: false,
        },
      },
    },
    {
      label: 'Safari',
      identity: {
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Version/26.0 Safari/605.1.15',
      },
    },
    {
      label: 'Firefox',
      identity: {
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:143.0) Gecko/20100101 Firefox/143.0',
      },
    },
    {
      label: 'Chrome on Android',
      identity: {
        userAgent:
          'Mozilla/5.0 (Linux; Android 16) Chrome/152.0.0.0 Mobile Safari/537.36',
      },
    },
    {
      label: 'Chrome on iOS',
      identity: {
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) CriOS/152.0.0.0 Mobile/15E148 Safari/604.1',
      },
    },
  ] satisfies Array<{ label: string; identity: BrowserIdentity }>)(
    'keeps the generic hint for $label',
    ({ identity }) => {
      expect(resolveWebMCPSetupHint(identity)).toBe('generic');
    },
  );

  it('uses the reduced user agent when userAgentData is unavailable', () => {
    expect(
      resolveWebMCPSetupHint({
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/152.0.0.0 Safari/537.36',
      }),
    ).toBe('chrome-flag');
  });
});

function chromeIdentity(version: number): BrowserIdentity {
  return {
    userAgent: `Mozilla/5.0 Chrome/${version}.0.0.0 Safari/537.36`,
    userAgentData: {
      brands: [
        { brand: 'Chromium', version: String(version) },
        { brand: 'Google Chrome', version: String(version) },
      ],
      mobile: false,
    },
  };
}
