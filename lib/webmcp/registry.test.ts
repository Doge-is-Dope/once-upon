import { beforeEach, describe, expect, it, vi } from 'vitest';

let definitions: WebMcpToolDefinition[];

beforeEach(() => {
  vi.resetModules();
  definitions = [];
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
  Object.defineProperty(window, 'originAgentCluster', { configurable: true, value: true });
  document.modelContext = {
    registerTool: vi.fn(async (definition) => { definitions.push(definition); }),
  };
});

describe('WebMCP registry', () => {
  it.each([
    ['desktop Chrome 149', { userAgentData: { brands: [{ brand: 'Google Chrome', version: '149' }], mobile: false }, userAgent: '' }, true],
    ['desktop Chrome 148', { userAgentData: { brands: [{ brand: 'Google Chrome', version: '148' }], mobile: false }, userAgent: '' }, false],
    ['mobile Chrome 149', { userAgentData: { brands: [{ brand: 'Google Chrome', version: '149' }], mobile: true }, userAgent: '' }, false],
    ['desktop Edge 149', { userAgentData: { brands: [{ brand: 'Chromium', version: '149' }, { brand: 'Microsoft Edge', version: '149' }], mobile: false }, userAgent: '' }, false],
    ['fallback desktop Chrome 149', { userAgent: 'Mozilla/5.0 Chrome/149.0.0.0 Safari/537.36' }, true],
    ['fallback mobile Chrome 149', { userAgent: 'Mozilla/5.0 (Linux; Android 16) Chrome/149.0.0.0 Mobile Safari/537.36' }, false],
    ['fallback Firefox', { userAgent: 'Mozilla/5.0 Firefox/148.0' }, false],
  ])('recognizes %s only when the Chrome flag can be enabled', async (_label, browser, expected) => {
    const { isDesktopChrome149Plus } = await import('./registry');
    expect(isDesktopChrome149Plus(browser as Navigator)).toBe(expected);
  });

  it('returns a stable API-unavailable cause without changing the feature gate', async () => {
    document.modelContext = undefined;
    const { getWebMcpCapability } = await import('./registry');
    expect(getWebMcpCapability()).toMatchObject({
      supported: false,
      issue: 'api_unavailable',
      reason: 'WebMCP is unavailable in this browser.',
    });
  });

  it('exposes ten distinct atomic tools', async () => {
    const { webMcpToolNames } = await import('./registry');
    const names = webMcpToolNames();
    expect(names).toHaveLength(10);
    expect(new Set(names).size).toBe(10);
    expect(names).toEqual(expect.arrayContaining(['get_public_game_state', 'propose_learn_questions', 'propose_accusation']));
  });

  it('registers the document singleton only once across concurrent mounts', async () => {
    const { ensureWebMcpRegistered } = await import('./registry');
    await Promise.all([ensureWebMcpRegistered(), ensureWebMcpRegistered()]);

    expect(document.modelContext?.registerTool).toHaveBeenCalledTimes(10);
    expect(new Set(definitions.map((definition) => definition.name)).size).toBe(10);
  });

  it('keeps the newest Host binding when an older Strict Mode lease releases', async () => {
    const publicState = { revision: 12 } as never;
    const { gameGateway } = await import('@/lib/game/gateway');
    const read = vi.spyOn(gameGateway, 'getPublicState').mockResolvedValue(publicState);
    const { bindHostRoom } = await import('./registry');
    const releaseOld = await bindHostRoom('old-room', async () => {});
    const releaseCurrent = await bindHostRoom('current-room', async () => {});
    releaseOld();

    const getState = definitions.find((definition) => definition.name === 'get_public_game_state');
    await expect(getState?.execute({}, { signal: new AbortController().signal })).resolves.toBe(publicState);
    expect(read).toHaveBeenCalledWith('current-room');
    releaseCurrent();
    read.mockRestore();
  });
});
