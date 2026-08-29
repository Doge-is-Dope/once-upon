import { describe, expect, it } from 'vitest';
import {
  classifyMissingWebMCP,
  registerExperienceTools,
  type WebMCPNavigator,
} from '../lib/webmcp/tools';
import { ExperienceController } from '../lib/runtime/controller';
import type { ExperienceStore } from '../lib/runtime/store';
import { fixtureExperience } from './fixtures';

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

  it('registers narration-neutral core tools with the configured payload schema', async () => {
    const registered: WebMCPToolDefinition[] = [];
    const modelContext = Object.assign(new EventTarget(), {
      registerTool(tool: WebMCPToolDefinition) {
        registered.push(tool);
        return Promise.resolve();
      },
    }) as WebMCPModelContext;
    const originalDocument = Object.getOwnPropertyDescriptor(
      globalThis,
      'document',
    );
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: { modelContext },
    });
    const emptyStore: ExperienceStore = {
      read: () => Promise.resolve(null),
      write: () => Promise.resolve(),
      mutate: () => Promise.resolve(null),
      clear: () => Promise.resolve(),
      quarantineCorrupt: () => Promise.resolve(),
    };

    try {
      const statuses: string[] = [];
      const cleanup = await registerExperienceTools(
        new ExperienceController(fixtureExperience(), emptyStore),
        (status) => statuses.push(status),
      );
      expect(registered.map((tool) => tool.name)).toEqual([
        'get_story_state',
        'perform_action',
        'commit_narration',
      ]);
      const narrationSchema = registered[2].inputSchema;
      expect(narrationSchema).toBeDefined();
      expect(
        (narrationSchema!.properties as Record<string, unknown>).payload,
      ).toMatchObject({
        type: 'object',
        properties: { format: { const: 'prose' } },
      });
      expect(statuses).toEqual(['connecting', 'connected']);
      cleanup();
    } finally {
      if (originalDocument)
        Object.defineProperty(globalThis, 'document', originalDocument);
      else Reflect.deleteProperty(globalThis, 'document');
    }
  });
});
