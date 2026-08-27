import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RoomBootstrap } from '@/lib/game/contracts';

let definitions: WebMcpToolDefinition[];

function room(): RoomBootstrap {
  return {
    viewerKind: 'host', selfState: null,
    publicState: {
      gameId: 'new-game', roomCode: 'TEST', mode: 'standard', phase: 'lobby', revision: 1, sequence: 1,
      checkpoint: null, eligibleAgentActions: [], round: 0, timerSeconds: 8,
      serverNowMs: 1_000_000, deadlineMs: null, activeWindowId: null, revealAtMs: null,
      players: [
        { seat: 'seat_a', sticker: null, ready: false, answered: false, traits: [] },
        { seat: 'seat_b', sticker: null, ready: false, answered: false, traits: [] },
      ],
      currentQuestion: null, suspicion: null,
      objection: { available: true, claimedBy: null, pendingTarget: null },
      accusation: null, result: null, timeline: [], eligibleEvidence: [], questionRequest: null,
    },
  };
}

function tool(name: string) {
  const definition = definitions.find((entry) => entry.name === name);
  if (!definition) throw new Error(`Tool not registered: ${name}`);
  return definition;
}

beforeEach(() => {
  vi.resetModules();
  definitions = [];
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
  Object.defineProperty(window, 'originAgentCluster', { configurable: true, value: true });
  document.modelContext = {
    registerTool: vi.fn(async (definition) => { definitions.push(definition); }),
  };
});

afterEach(() => vi.restoreAllMocks());

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

  it('exposes the entry tool alongside the ten atomic game tools', async () => {
    const { webMcpToolNames } = await import('./registry');
    const names = webMcpToolNames();
    expect(names).toHaveLength(11);
    expect(new Set(names).size).toBe(11);
    expect(names).toEqual(expect.arrayContaining(['start_game', 'get_public_game_state', 'propose_learn_questions', 'propose_accusation']));
  });

  it('registers the document singleton only once across concurrent mounts', async () => {
    const { ensureWebMcpRegistered } = await import('./registry');
    await Promise.all([ensureWebMcpRegistered(), ensureWebMcpRegistered()]);

    expect(document.modelContext?.registerTool).toHaveBeenCalledTimes(11);
    expect(new Set(definitions.map((definition) => definition.name)).size).toBe(11);
  });

  it('creates only when invoked, returns no private bootstrap data, and binds the Host before returning', async () => {
    const bootstrap = room();
    bootstrap.selfState = {
      seat: 'seat_a', role: 'mirror', selectedOptionId: 'sealed-answer', options: [], canAnswer: false,
      canClaimObjection: false, traitFeedbackRequiredIds: [], roleAcknowledged: false,
    };
    const create = vi.fn().mockResolvedValue(bootstrap);
    const refresh = vi.fn().mockResolvedValue(undefined);
    const { gameGateway } = await import('@/lib/game/gateway');
    const read = vi.spyOn(gameGateway, 'getPublicState').mockResolvedValue(bootstrap.publicState);
    const { bindGameLauncher } = await import('./registry');
    const release = await bindGameLauncher(create, refresh);
    expect(create).not.toHaveBeenCalled();

    const result = await tool('start_game').execute({}, { signal: new AbortController().signal });
    expect(result).toMatchObject({
      roomCode: 'TEST', joinUrl: `${window.location.origin}/?room=TEST`, publicState: bootstrap.publicState,
    });
    expect(result).not.toHaveProperty('selfState');
    expect(JSON.stringify(result)).not.toContain('sealed-answer');
    expect(create).toHaveBeenCalledOnce();
    await expect(tool('get_public_game_state').execute({}, { signal: new AbortController().signal })).resolves.toBe(bootstrap.publicState);
    expect(read).toHaveBeenCalledWith('new-game');
    release();
    await expect(tool('get_public_game_state').execute({}, { signal: new AbortController().signal })).rejects.toThrow('NOT_AUTHORIZED');
  });

  it('resumes an existing Host room, including its both-ready lobby checkpoint', async () => {
    const bootstrap = room();
    bootstrap.publicState = {
      ...bootstrap.publicState, revision: 4, sequence: 4,
      checkpoint: { id: 'learn-checkpoint', kind: 'awaiting_learn_questions' },
      eligibleAgentActions: ['propose_learn_questions'],
    };
    const create = vi.fn();
    const { gameGateway } = await import('@/lib/game/gateway');
    vi.spyOn(gameGateway, 'getPublicState').mockResolvedValue(bootstrap.publicState);
    const { bindGameLauncher, bindHostRoom } = await import('./registry');
    const releaseLauncher = await bindGameLauncher(create, async () => {});
    const releaseHost = await bindHostRoom('new-game', async () => {});
    const result = await tool('start_game').execute({}, { signal: new AbortController().signal });
    expect(result).toMatchObject({ publicState: bootstrap.publicState, instructions: expect.stringContaining('even if phase is still lobby') });
    expect(create).not.toHaveBeenCalled();
    releaseHost();
    releaseLauncher();
  });

  it('does not create a room for an already-cancelled invocation', async () => {
    const create = vi.fn();
    const { bindGameLauncher } = await import('./registry');
    const release = await bindGameLauncher(create, async () => {});
    const controller = new AbortController();
    controller.abort();
    await expect(tool('start_game').execute({}, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(create).not.toHaveBeenCalled();
    release();
  });

  it('retains a committed room when the caller cancels while creation is pending', async () => {
    const bootstrap = room();
    let finish!: (value: RoomBootstrap) => void;
    const create = vi.fn(() => new Promise<RoomBootstrap>((resolve) => { finish = resolve; }));
    const { bindGameLauncher } = await import('./registry');
    const release = await bindGameLauncher(create, async () => {});
    const controller = new AbortController();
    const pending = tool('start_game').execute({}, { signal: controller.signal });
    controller.abort();
    finish(bootstrap);
    await expect(pending).resolves.toMatchObject({ publicState: bootstrap.publicState });
    const { gameGateway } = await import('@/lib/game/gateway');
    vi.spyOn(gameGateway, 'getPublicState').mockResolvedValue(bootstrap.publicState);
    await tool('start_game').execute({}, { signal: new AbortController().signal });
    expect(create).toHaveBeenCalledOnce();
    release();
  });

  it('does not leave a late Host binding after its launcher unmounts', async () => {
    let finish!: (value: RoomBootstrap) => void;
    const { bindGameLauncher } = await import('./registry');
    const release = await bindGameLauncher(() => new Promise((resolve) => { finish = resolve; }), async () => {});
    const pending = tool('start_game').execute({}, { signal: new AbortController().signal });
    release();
    finish(room());
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await expect(tool('get_public_game_state').execute({}, { signal: new AbortController().signal })).rejects.toThrow('NOT_AUTHORIZED');
    await expect(tool('start_game').execute({}, { signal: new AbortController().signal })).rejects.toThrow('NOT_AUTHORIZED');
  });

  it('preserves the newest launcher when a stale Strict Mode lease releases', async () => {
    const oldCreate = vi.fn();
    const newCreate = vi.fn().mockResolvedValue(room());
    const { bindGameLauncher } = await import('./registry');
    const releaseOld = await bindGameLauncher(oldCreate, async () => {});
    const releaseNew = await bindGameLauncher(newCreate, async () => {});
    releaseOld();
    await tool('start_game').execute({}, { signal: new AbortController().signal });
    expect(oldCreate).not.toHaveBeenCalled();
    expect(newCreate).toHaveBeenCalledOnce();
    releaseNew();
  });

  it('rejects a non-Host bootstrap without exposing it or binding game tools', async () => {
    const { bindGameLauncher } = await import('./registry');
    const release = await bindGameLauncher(async () => ({ ...room(), viewerKind: 'seat_a' }), async () => {});
    await expect(tool('start_game').execute({}, { signal: new AbortController().signal })).rejects.toThrow('NOT_AUTHORIZED');
    await expect(tool('get_public_game_state').execute({}, { signal: new AbortController().signal })).rejects.toThrow('NOT_AUTHORIZED');
    release();
  });

  it('reports a failed creation without retrying or binding a Host', async () => {
    const create = vi.fn().mockRejectedValue(new Error('Room creation failed.'));
    const { bindGameLauncher } = await import('./registry');
    const release = await bindGameLauncher(create, async () => {});
    await expect(tool('start_game').execute({}, { signal: new AbortController().signal })).rejects.toThrow('Room creation failed.');
    expect(create).toHaveBeenCalledOnce();
    await expect(tool('get_public_game_state').execute({}, { signal: new AbortController().signal })).rejects.toThrow('NOT_AUTHORIZED');
    release();
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
