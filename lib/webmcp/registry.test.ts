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
