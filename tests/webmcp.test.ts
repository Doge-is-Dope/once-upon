import { afterEach, describe, expect, it } from 'vitest';
import { ExperienceController } from '../lib/runtime/controller';
import {
  beginStoryTurn,
  commitStoryChapter,
  createExperienceSession,
} from '../lib/runtime/engine';
import type { ExperienceSession } from '../lib/runtime/types';
import { registerExperienceTools } from '../lib/webmcp/tools';
import {
  fixtureIds,
  fixtureProtectedTerms,
  recordFixtureExperience,
} from './support/fixture-story';
import {
  operationId,
  ordinaryProse,
  ordinaryRecordProse,
  testContext,
} from './helpers';

type Registered = {
  tool: WebMCPToolDefinition;
  signal?: AbortSignal;
};

const originalDocument = Object.getOwnPropertyDescriptor(
  globalThis,
  'document',
);

afterEach(() => {
  if (originalDocument)
    Object.defineProperty(globalThis, 'document', originalDocument);
  else Reflect.deleteProperty(globalThis, 'document');
});

function installModelContext(failName?: string) {
  const current = new Map<string, Registered>();
  const history: Registered[] = [];
  const context = Object.assign(new EventTarget(), {
    registerTool(
      tool: WebMCPToolDefinition,
      options?: { signal?: AbortSignal },
    ) {
      if (tool.name === failName) return Promise.reject(new Error('refused'));
      const record = { tool, signal: options?.signal };
      current.set(tool.name, record);
      history.push(record);
      options?.signal?.addEventListener(
        'abort',
        () => {
          if (current.get(tool.name) === record) current.delete(tool.name);
        },
        { once: true },
      );
      return Promise.resolve();
    },
  }) as WebMCPModelContext;
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { modelContext: context },
  });
  return { current, history };
}

function installDelayedModelContext() {
  const current = new Map<string, Registered>();
  const history: Registered[] = [];
  let delayFirst = true;
  let releaseFirst: () => void = () => undefined;
  const context = Object.assign(new EventTarget(), {
    registerTool(
      tool: WebMCPToolDefinition,
      options?: { signal?: AbortSignal },
    ) {
      const record = { tool, signal: options?.signal };
      history.push(record);
      return new Promise<void>((resolve, reject) => {
        const install = () => {
          if (options?.signal?.aborted) {
            resolve();
            return;
          }
          if (current.has(tool.name)) {
            reject(new Error(`duplicate registration: ${tool.name}`));
            return;
          }
          current.set(tool.name, record);
          options?.signal?.addEventListener(
            'abort',
            () => {
              if (current.get(tool.name) === record) current.delete(tool.name);
            },
            { once: true },
          );
          resolve();
        };
        if (delayFirst) {
          delayFirst = false;
          releaseFirst = install;
        } else install();
      });
    },
  }) as WebMCPModelContext;
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { modelContext: context },
  });
  return { current, history, releaseFirst: () => releaseFirst() };
}

function installRejectedModelContext(error: Error) {
  const context = Object.assign(new EventTarget(), {
    registerTool() {
      return Promise.reject(error);
    },
  }) as WebMCPModelContext;
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { modelContext: context },
  });
}

async function controllerFor(session?: ExperienceSession) {
  const initial =
    session ?? createExperienceSession(recordFixtureExperience, testContext());
  const controller = new ExperienceController(recordFixtureExperience, initial);
  return { controller };
}

function keyAvailableSession() {
  let session = createExperienceSession(recordFixtureExperience, testContext());
  session = beginStoryTurn(
    recordFixtureExperience,
    session,
    {
      operationId: operationId('prep_begin'),
      expectedSessionId: session.sessionId,
      expectedRevision: session.revision,
      playerChoice: 'I search beneath the desk and find a small key.',
    },
    testContext(),
  ).session;
  return commitStoryChapter(
    recordFixtureExperience,
    session,
    {
      operationId: operationId('prep_chapter'),
      expectedSessionId: session.sessionId,
      expectedRevision: session.revision,
      turnId: session.pendingTurn!.turnId,
      title: 'A key beneath the desk',
      prose: ordinaryProse,
      recordProse: ordinaryRecordProse,
      continuitySummary:
        'You found a small key beneath the desk. The blank ledger, handleless door, lamp, and the unanswered question about the study remain in the room.',
      discoveryIds: [fixtureIds.discoveries.key],
      status: 'continue',
    },
    testContext(),
  ).session;
}

describe('WebMCP living tool surface', () => {
  it('reports unsupported when WebMCP is unavailable for the page', async () => {
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: {},
    });
    const { controller } = await controllerFor();
    const statuses: string[] = [];

    const cleanup = await registerExperienceTools(controller, (status) =>
      statuses.push(status),
    );

    expect(statuses).toEqual(['unsupported']);
    cleanup();
  });

  it('reports disabled when WebMCP registration is blocked', async () => {
    installRejectedModelContext(
      new DOMException('site tools are disabled', 'NotAllowedError'),
    );
    const { controller } = await controllerFor();
    const statuses: string[] = [];

    const cleanup = await registerExperienceTools(controller, (status) =>
      statuses.push(status),
    );

    expect(statuses).toEqual(['connecting', 'disabled']);
    cleanup();
  });

  it('registers stable core tools with a self-describing bootstrap contract', async () => {
    const registry = installModelContext();
    const { controller } = await controllerFor();
    const statuses: string[] = [];
    const cleanup = await registerExperienceTools(controller, (status) =>
      statuses.push(status),
    );
    expect([...registry.current.keys()]).toEqual([
      'get_story_state',
      'begin_story_turn',
      'commit_story_chapter',
    ]);
    const getState = registry.current.get('get_story_state')!.tool;
    expect(getState.annotations).toMatchObject({
      readOnlyHint: true,
      untrustedContentHint: true,
    });
    expect(getState).not.toHaveProperty('exposedTo');
    expect(getState.title).toBe('Start or resume Fixture Story');
    expect(getState.description).toContain('before every player turn');
    expect(getState.description.length).toBeLessThan(240);
    expect(getState.description).not.toContain('fixture-agent-v0');
    expect(getState.description).not.toContain(
      'close second-person novel prose',
    );
    expect(getState.description).not.toContain(
      fixtureProtectedTerms.drawerNote,
    );
    const bootstrap = (await getState.execute({})) as {
      content: Array<{ text: string }>;
      structuredContent: {
        state: {
          requiredNextTool: string;
          allowedNextTools: string[];
          bootstrap: {
            protocolVersion: string;
            contractVersion: string;
            instructions: string;
            mode: string;
          };
        };
      };
    };
    expect(bootstrap.structuredContent.state.bootstrap).toEqual({
      protocolVersion: 'living-manuscript-v2',
      contractVersion: fixtureIds.contract,
      instructions: expect.stringContaining('recordProse'),
      mode: 'opening',
    });
    expect(bootstrap.structuredContent.state.requiredNextTool).toBe('none');
    expect(bootstrap.structuredContent.state.allowedNextTools).toEqual([
      'begin_story_turn',
    ]);
    expect(bootstrap.content[0].text).toContain(
      'If the latest user message contains no character action, ask what they do.',
    );
    expect(bootstrap.content[0].text).toContain(
      'latest message already contains an explicit character action',
    );
    expect(bootstrap.content[0].text).toContain(
      'a mention, question, or recollection is not permission',
    );
    expect(
      registry.current.get('begin_story_turn')!.tool.description,
    ).toContain('commit_story_chapter in the same response');
    expect(statuses).toEqual(['connecting', 'connected']);
    cleanup();
  });

  it('cleans partial registrations and does not report a failed surface as connected', async () => {
    const registry = installModelContext('begin_story_turn');
    const { controller } = await controllerFor();
    const statuses: string[] = [];
    const cleanup = await registerExperienceTools(controller, (status) =>
      statuses.push(status),
    );
    expect(registry.current.size).toBe(0);
    expect(statuses).toEqual(['connecting', 'error']);
    cleanup();
  });

  it('aborts an in-flight connection before a replacement registers the same names', async () => {
    const registry = installDelayedModelContext();
    const { controller } = await controllerFor();
    const firstLifecycle = new AbortController();
    const firstStatuses: string[] = [];
    const firstRegistration = registerExperienceTools(
      controller,
      (status) => firstStatuses.push(status),
      undefined,
      firstLifecycle.signal,
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(registry.history.map(({ tool }) => tool.name)).toEqual([
      'get_story_state',
    ]);

    firstLifecycle.abort();
    registry.releaseFirst();
    const firstCleanup = await firstRegistration;
    expect(registry.current.size).toBe(0);
    expect(firstStatuses).toEqual(['connecting']);

    const secondStatuses: string[] = [];
    const secondCleanup = await registerExperienceTools(controller, (status) =>
      secondStatuses.push(status),
    );
    expect([...registry.current.keys()]).toEqual([
      'get_story_state',
      'begin_story_turn',
      'commit_story_chapter',
    ]);
    expect(secondStatuses).toEqual(['connecting', 'connected']);
    expect(registry.history.map(({ tool }) => tool.name)).toEqual([
      'get_story_state',
      'get_story_state',
      'begin_story_turn',
      'commit_story_chapter',
    ]);
    firstCleanup();
    secondCleanup();
  });

  it('keeps every core lease stable across READY and AWAITING_CHAPTER', async () => {
    const registry = installModelContext();
    const { controller } = await controllerFor();
    const cleanup = await registerExperienceTools(controller, () => {});
    const begin = registry.current.get('begin_story_turn')!;
    const commit = registry.current.get('commit_story_chapter')!;
    const beginInput = {
      operationId: operationId('web_begin'),
      expectedSessionId: controller.getSnapshot()!.sessionId,
      expectedRevision: 1,
      playerChoice: 'I examine the indented ledger page before proceeding.',
    };
    const result = (await begin.tool.execute(beginInput)) as {
      content: Array<{ text: string }>;
      structuredContent: unknown;
    };
    expect(result.structuredContent).toMatchObject({ ok: true });
    expect(result.content[0].text).toContain(
      'REQUIRED NEXT: call commit_story_chapter now',
    );
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(begin.signal?.aborted).toBe(false);
    expect(commit.signal?.aborted).toBe(false);
    expect([...registry.current.keys()]).toEqual([
      'get_story_state',
      'begin_story_turn',
      'commit_story_chapter',
    ]);
    const pending = controller.getSnapshot()!;
    const committed = (await registry.current
      .get('commit_story_chapter')!
      .tool.execute({
        operationId: operationId('web_chapter'),
        expectedSessionId: pending.sessionId,
        expectedRevision: pending.revision,
        turnId: pending.pendingTurn!.turnId,
        title: 'The room listens',
        prose: ordinaryProse,
        recordProse: ordinaryRecordProse,
        continuitySummary:
          'You listened while the locked study stayed closed and quiet.',
        discoveryIds: [],
        status: 'continue',
      })) as { content: Array<{ text: string }> };
    expect(committed.content[0].text).toContain('Chapter saved at revision');
    expect(committed.content[0].text).toMatch(
      /The page is typing it now \(about \d+ s\)/,
    );
    expect(committed.content[0].text).toContain(
      'Do not repeat or summarize it in chat',
    );
    expect(
      (
        committed as unknown as {
          structuredContent: { pagePresentation?: unknown };
        }
      ).structuredContent.pagePresentation,
    ).toEqual({ typingMs: expect.any(Number) });
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(begin.signal?.aborted).toBe(false);
    expect(commit.signal?.aborted).toBe(false);
    expect(registry.history.map(({ tool }) => tool.name)).toEqual([
      'get_story_state',
      'begin_story_turn',
      'commit_story_chapter',
    ]);

    const lateRetry = (await begin.tool.execute(beginInput)) as {
      content: Array<{ text: string }>;
      structuredContent: Record<string, unknown>;
    };
    expect(lateRetry.structuredContent).toMatchObject({
      ok: true,
      idempotentReplay: true,
      state: { phase: 'READY' },
    });
    expect(lateRetry.structuredContent).not.toHaveProperty('turnId');
    expect(lateRetry.content[0].text).toContain(
      'Use begin_story_turn for an explicit character action.',
    );
    cleanup();
  });

  it('registers an unlocked story object without leaking its fact in metadata', async () => {
    const registry = installModelContext();
    const { controller } = await controllerFor(keyAvailableSession());
    const cleanup = await registerExperienceTools(controller, () => {});
    expect([...registry.current.keys()]).toEqual([
      'get_story_state',
      'begin_story_turn',
      'commit_story_chapter',
      fixtureIds.tools.drawer,
    ]);
    const getState = registry.current.get('get_story_state')!.tool;
    const state = (await getState.execute({})) as {
      structuredContent: {
        state: { requiredNextTool: string; allowedNextTools: string[] };
      };
    };
    expect(state.structuredContent.state.requiredNextTool).toBe('none');
    expect(state.structuredContent.state.allowedNextTools).toEqual([
      'begin_story_turn',
      fixtureIds.tools.drawer,
    ]);
    const drawer = registry.current.get(fixtureIds.tools.drawer)!.tool;
    const metadata = JSON.stringify({
      name: drawer.name,
      title: drawer.title,
      description: drawer.description,
      inputSchema: drawer.inputSchema,
    });
    expect(metadata).not.toContain(fixtureProtectedTerms.drawerNote);
    expect(metadata).not.toContain('The panel is behind the lamp');
    expect(drawer.description).toContain('explicitly asks');
    expect(drawer.description).toContain(
      'commit_story_chapter in the same response before replying',
    );

    const before = controller.getSnapshot()!;
    await registry.current.get('begin_story_turn')!.tool.execute({
      operationId: operationId('ordinary_while_drawer_unlocked'),
      expectedSessionId: before.sessionId,
      expectedRevision: before.revision,
      playerChoice: 'I look at the key without trying it in the drawer.',
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(registry.current.has(fixtureIds.tools.drawer)).toBe(true);
    const pending = (await getState.execute({})) as {
      structuredContent: {
        state: { allowedNextTools: string[]; requiredNextTool: string };
      };
    };
    expect(pending.structuredContent.state).toMatchObject({
      allowedNextTools: ['commit_story_chapter'],
      requiredNextTool: 'commit_story_chapter',
    });
    expect(registry.history.map(({ tool }) => tool.name)).toEqual([
      'get_story_state',
      'begin_story_turn',
      'commit_story_chapter',
      fixtureIds.tools.drawer,
    ]);
    cleanup();
  });

  it('waits for every concurrent invocation before retiring a story object', async () => {
    const registry = installModelContext();
    const { controller } = await controllerFor(keyAvailableSession());
    const cleanup = await registerExperienceTools(controller, () => {});
    const drawer = registry.current.get(fixtureIds.tools.drawer)!.tool;
    const originalInvoke = controller.invokeInteraction.bind(controller);
    let releaseFirst: () => void = () => undefined;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let invocationCount = 0;
    controller.invokeInteraction = async (input) => {
      invocationCount += 1;
      if (invocationCount === 1) await firstGate;
      return originalInvoke(input);
    };
    const snapshot = controller.getSnapshot()!;
    const first = Promise.resolve(
      drawer.execute({
        operationId: operationId('concurrent_first'),
        expectedSessionId: snapshot.sessionId,
        expectedRevision: snapshot.revision,
        playerChoice: 'I unlock the drawer with the key.',
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    const second = Promise.resolve(
      drawer.execute({
        operationId: operationId('concurrent_second'),
        expectedSessionId: snapshot.sessionId,
        expectedRevision: snapshot.revision,
        playerChoice: 'I unlock the drawer with the key.',
      }),
    );
    await second;
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(registry.current.has(fixtureIds.tools.drawer)).toBe(true);

    releaseFirst();
    await first;
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(registry.current.has(fixtureIds.tools.drawer)).toBe(false);
    cleanup();
  });

  it('cancels before mutation and returns one canonical agent receipt after invocation', async () => {
    const registry = installModelContext();
    const { controller } = await controllerFor(keyAvailableSession());
    const cleanup = await registerExperienceTools(controller, () => {});
    const drawer = registry.current.get(fixtureIds.tools.drawer)!.tool;
    const beforeRevision = controller.getSnapshot().revision;
    const cancelled = new AbortController();
    cancelled.abort();
    await expect(
      drawer.execute(
        {
          operationId: operationId('cancelled'),
          expectedSessionId: controller.getSnapshot().sessionId,
          expectedRevision: beforeRevision,
          playerChoice: 'I turn the key in the drawer.',
        },
        { signal: cancelled.signal },
      ),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(controller.getSnapshot().revision).toBe(beforeRevision);

    const result = (await drawer.execute({
      operationId: operationId('web_drawer'),
      expectedSessionId: controller.getSnapshot().sessionId,
      expectedRevision: beforeRevision,
      playerChoice: 'I open the drawer with the key.',
    })) as {
      content: Array<{ text: string }>;
      structuredContent: {
        effectReceipt: { receiptId: string; facts: unknown[] };
      };
    };
    expect(result.structuredContent.effectReceipt).toMatchObject({
      facts: [
        {
          id: fixtureIds.facts.drawerNote,
          value: expect.stringContaining(fixtureProtectedTerms.drawerNote),
        },
      ],
    });
    expect(result.content[0].text).not.toContain('{"');
    expect(result.content[0].text).toContain('REQUIRED NEXT: commit receipt');
    expect(controller.getSnapshot().pendingTurn?.effectReceipt?.receiptId).toBe(
      result.structuredContent.effectReceipt.receiptId,
    );
    cleanup();
  });

  it('rejects coercion, extra fields, mixed arrays, and unknown IDs', async () => {
    const registry = installModelContext();
    const { controller } = await controllerFor(keyAvailableSession());
    const cleanup = await registerExperienceTools(controller, () => {});
    const before = controller.getSnapshot();
    const begin = registry.current.get('begin_story_turn')!.tool;
    const invalidCalls = [
      begin.execute({
        operationId: operationId('extra_field'),
        expectedSessionId: before.sessionId,
        expectedRevision: before.revision,
        playerChoice: 'I inspect the door.',
        extra: true,
      }),
      begin.execute({
        operationId: operationId('string_revision'),
        expectedSessionId: before.sessionId,
        expectedRevision: String(before.revision),
        playerChoice: 'I inspect the door.',
      }),
      registry.current.get('get_story_state')!.tool.execute({ extra: true }),
    ];
    for (const call of invalidCalls) {
      const result = (await call) as {
        structuredContent: { ok: boolean; code: string };
      };
      expect(result.structuredContent).toMatchObject({
        ok: false,
        code: 'INVALID_INPUT',
      });
    }
    expect(controller.getSnapshot().revision).toBe(before.revision);

    const started = await controller.beginStoryTurn({
      operationId: operationId('strict_chapter_begin'),
      expectedSessionId: before.sessionId,
      expectedRevision: before.revision,
      playerChoice: 'I inspect the door.',
    });
    expect(started.ok).toBe(true);
    const pending = controller.getSnapshot();
    const chapter = registry.current.get('commit_story_chapter')!.tool;
    const invalidChapter = (await chapter.execute({
      operationId: operationId('strict_chapter'),
      expectedSessionId: pending.sessionId,
      expectedRevision: pending.revision,
      turnId: pending.pendingTurn!.turnId,
      title: 'Strict input',
      prose: ordinaryProse,
      recordProse: ordinaryRecordProse,
      continuitySummary: 'The study remains unchanged.',
      discoveryIds: [fixtureIds.discoveries.key, 7],
      status: 'continue',
    })) as { structuredContent: { ok: boolean; code: string } };
    expect(invalidChapter.structuredContent).toMatchObject({
      ok: false,
      code: 'INVALID_INPUT',
    });
    expect(controller.getSnapshot().pendingTurn).not.toBeNull();
    cleanup();
  });
});
