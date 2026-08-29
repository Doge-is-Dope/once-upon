import { describe, expect, it } from 'vitest';
import {
  classifyMissingWebMCP,
  type WebMCPNavigator,
} from '../lib/webmcp/tools';

function browser(brands?: Array<{ brand: string; version: string }>) {
  return {
    userAgentData: brands ? { brands } : undefined,
  } as unknown as WebMCPNavigator;
}

describe('missing WebMCP classification', () => {
  it('treats Chrome 149 and newer as disabled', () => {
    expect(
      classifyMissingWebMCP(
        browser([{ brand: 'Google Chrome', version: '149' }]),
      ),
    ).toBe('disabled');
    expect(
      classifyMissingWebMCP(
        browser([{ brand: 'Google Chrome', version: '153.0.0.0' }]),
      ),
    ).toBe('disabled');
  });

  it('does not offer the Chrome flag to older or unconfirmed browsers', () => {
    expect(
      classifyMissingWebMCP(
        browser([{ brand: 'Google Chrome', version: '148' }]),
      ),
    ).toBe('unsupported');
    expect(
      classifyMissingWebMCP(browser([{ brand: 'Chromium', version: '153' }])),
    ).toBe('unsupported');
    expect(classifyMissingWebMCP(browser())).toBe('unsupported');
  });
});
