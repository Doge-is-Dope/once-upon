import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { PublicGameSnapshot } from '../../lib/game/contracts';

type GameTestWindow = Window & typeof globalThis & {
  __webMcpTools: Map<string, WebMcpToolDefinition>;
  __gameTest: { createCalls: number; readyPlayers(): void };
};

function snapshot(overrides: Partial<PublicGameSnapshot> = {}): PublicGameSnapshot {
  return {
    gameId: 'lobby-layout-test', roomCode: 'TEST', mode: 'standard', phase: 'lobby',
    checkpoint: null, revision: 1, sequence: 1, round: 0, timerSeconds: 8,
    serverNowMs: 1_000_000, deadlineMs: null, activeWindowId: null, revealAtMs: null,
    players: [
      { seat: 'seat_a', sticker: null, ready: false, answered: false, traits: [] },
      { seat: 'seat_b', sticker: null, ready: false, answered: false, traits: [] },
    ],
    currentQuestion: null, suspicion: null,
    objection: { available: true, claimedBy: null, pendingTarget: null },
    accusation: null, result: null, timeline: [], eligibleEvidence: [],
    eligibleAgentActions: [], questionRequest: null,
    ...overrides,
  };
}

async function prepareRoom(page: Page, game: PublicGameSnapshot, viewerKind: 'host' | 'join' = 'host') {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    const tools = new Map<string, WebMcpToolDefinition>();
    (window as GameTestWindow).__webMcpTools = tools;
    Object.defineProperty(document, 'modelContext', {
      configurable: true,
      value: {
        registerTool: async (tool: WebMcpToolDefinition, options?: { signal?: AbortSignal }) => {
          if (tools.has(tool.name)) throw new Error(`Duplicate tool: ${tool.name}`);
          tools.set(tool.name, tool);
          options?.signal?.addEventListener('abort', () => tools.delete(tool.name), { once: true });
        },
      },
    });
  });
  await page.route('**/lib/supabase/client.ts*', (route) => route.fulfill({
    contentType: 'application/javascript',
    body: 'export const hasSupabaseConfig = () => true;',
  }));
  // The real UI and registry use a local gateway fixture, so these tests never
  // create live Supabase rooms or need real backend credentials.
  await page.route('**/lib/game/gateway.ts*', (route) => route.fulfill({
    contentType: 'application/javascript',
    body: `
      let publicState = ${JSON.stringify(game)};
      const listeners = new Set();
      const bootstrap = () => ({ publicState, selfState: null, viewerKind: ${JSON.stringify(viewerKind)} });
      window.__gameTest = {
        createCalls: 0,
        readyPlayers() {
          publicState = {
            ...publicState,
            players: publicState.players.map((player, index) => ({ ...player, sticker: index ? 'ghost' : 'tiger', ready: true })),
            revision: 5, sequence: 5,
            checkpoint: { id: 'learn-checkpoint', kind: 'awaiting_learn_questions' },
            eligibleAgentActions: ['propose_learn_questions'],
          };
          for (const listener of listeners) listener();
        },
      };
      export const gameGateway = {
        createRoom: async () => { window.__gameTest.createCalls++; return bootstrap(); },
        bootstrapRoom: async () => bootstrap(),
        refresh: async () => ({ publicState, selfState: null }),
        getPublicState: async () => publicState,
        subscribe: async (_id, invalidate, status) => { listeners.add(invalidate); status('SUBSCRIBED'); return () => listeners.delete(invalidate); },
        waitForPublicEvent: async (_id, afterSequence) => afterSequence < publicState.sequence
          ? { id: publicState.sequence, sequence: publicState.sequence, type: 'players_ready', actor: 'system', summary: 'Both players are ready.', createdAt: new Date().toISOString() }
          : null,
        agentAction: async (name, gameId, checkpointId, expectedRevision, payload) => {
          if (name !== 'propose_learn_questions' || gameId !== publicState.gameId || checkpointId !== publicState.checkpoint?.id || expectedRevision !== publicState.revision) {
            throw new Error('The Detective must use the current eligible checkpoint and revision.');
          }
          if (payload.questions.length !== 5) throw new Error('Expected five Learn questions.');
          publicState = {
            ...publicState, phase: 'learn', checkpoint: null, eligibleAgentActions: [],
            revision: publicState.revision + 1, sequence: publicState.sequence + 1,
            currentQuestion: { id: 'learn-1', kind: 'learn', ordinal: 1, prompt: payload.questions[0].prompt },
          };
          return { ok: true, revision: publicState.revision, sequence: publicState.sequence, phase: publicState.phase, data: {} };
        },
        setTimerMode: async (_id, timerSeconds) => {
          publicState = { ...publicState, timerSeconds, revision: publicState.revision + 1 };
          return bootstrap();
        },
      };
    `,
  }));
  return errors;
}

async function showRoom(page: Page, game: PublicGameSnapshot) {
  const errors = await prepareRoom(page, game);
  await page.goto('/?room=TEST');
  await expect(page.locator('.host-board')).toBeVisible();
  await expect(page.getByText('Reconnecting… Your seat is safe.')).toBeHidden();
  expect(errors, 'opening a room directly must not cause hydration errors').toEqual([]);
}

test('homepage WebMCP entry creates one room, shows its QR, and continues into Learn', async ({ page }) => {
  const errors = await prepareRoom(page, snapshot());
  await page.goto('/');
  await expect(page.getByText('“Let’s play.”', { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as GameTestWindow).__webMcpTools.has('start_game'))).toBe(true);
  expect(await page.evaluate(() => (window as GameTestWindow).__gameTest.createCalls)).toBe(0);

  const start = await page.evaluate(async () => {
    const tools = (window as GameTestWindow).__webMcpTools;
    const context = { signal: new AbortController().signal };
    const result = await tools.get('start_game')!.execute({}, context) as { roomCode: string; joinUrl: string; publicState: PublicGameSnapshot };
    const immediateState = await tools.get('get_public_game_state')!.execute({}, context) as PublicGameSnapshot;
    return { result, immediateState };
  });
  expect(start.result.roomCode).toBe('TEST');
  expect(start.result.joinUrl).toBe(new URL('/?room=TEST', page.url()).href);
  expect(start.result).not.toHaveProperty('selfState');
  expect(start.immediateState.gameId).toBe(start.result.publicState.gameId);
  await expect(page).toHaveURL(/\?room=TEST$/);
  await expect(page.getByRole('heading', { name: 'Invite players' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Scan to join this room' })).toBeVisible();

  await page.evaluate(async () => {
    await (window as GameTestWindow).__webMcpTools.get('start_game')!.execute({}, { signal: new AbortController().signal });
    (window as GameTestWindow).__gameTest.readyPlayers();
  });
  expect(await page.evaluate(() => (window as GameTestWindow).__gameTest.createCalls)).toBe(1);

  const ready = await page.evaluate(async (sequence) => {
    const tools = (window as GameTestWindow).__webMcpTools;
    const context = { signal: new AbortController().signal };
    const event = await tools.get('wait_for_public_event')!.execute({ afterSequence: sequence, timeoutMs: 20000 }, context);
    const state = await tools.get('get_public_game_state')!.execute({}, context) as PublicGameSnapshot;
    return { event, state };
  }, start.result.publicState.sequence);
  expect(ready.event).toMatchObject({ sequence: 5 });
  expect(ready.state).toMatchObject({ phase: 'lobby', eligibleAgentActions: ['propose_learn_questions'] });

  await page.evaluate(async (state) => {
    const questions = [
      'What is your ideal weekend?', 'Which snack would you pick?', 'How do you choose a movie?',
      'Where would you meet friends?', 'What makes a great morning?',
    ].map((prompt) => ({ prompt, options: ['Something new', 'A familiar favorite', 'Let a friend pick', 'Whatever is nearby'] }));
    await (window as GameTestWindow).__webMcpTools.get('propose_learn_questions')!.execute({
      checkpointId: state.checkpoint!.id, expectedRevision: state.revision, questions,
    }, { signal: new AbortController().signal });
  }, ready.state);
  await expect(page.getByRole('heading', { name: 'Learn 1/5', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'What is your ideal weekend?' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('manual start can hand the existing room to the AI', async ({ page }) => {
  const errors = await prepareRoom(page, snapshot());
  await page.goto('/');
  await page.getByRole('button', { name: 'Start a game' }).click();
  await expect(page.getByRole('heading', { name: 'Invite players' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as GameTestWindow).__webMcpTools.has('start_game'))).toBe(true);
  const result = await page.evaluate(async () => (window as GameTestWindow).__webMcpTools.get('start_game')!.execute({}, { signal: new AbortController().signal }));
  expect(result).toMatchObject({ roomCode: 'TEST' });
  expect(await page.evaluate(() => (window as GameTestWindow).__gameTest.createCalls)).toBe(1);
  expect(errors).toEqual([]);
});

test('direct phone join never registers Host or start tools during hydration', async ({ page }) => {
  const errors = await prepareRoom(page, snapshot(), 'join');
  await page.goto('/?room=TEST');
  await expect(page.getByRole('heading', { name: 'Choose your sticker' })).toBeVisible();
  expect(await page.evaluate(() => (window as GameTestWindow).__webMcpTools.size)).toBe(0);
  expect(await page.evaluate(() => (window as GameTestWindow).__gameTest.createCalls)).toBe(0);
  expect(errors).toEqual([]);
});

test('lobby uses equal player cards without implicit grid columns at every breakpoint', async ({ page }) => {
  await showRoom(page, snapshot());
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Invite players');
  await expect(page.getByText('Scan to join', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Waiting to join…', exact: true })).toHaveCount(2);
  await expect(page.getByText(/Main screen ·|Live Room/)).toHaveCount(0);
  await expect(page.getByRole('list', { name: 'Game progress' })).toHaveCount(0);
  await expect(page.getByText('Extended answer time')).toBeHidden();
  await expect(page.getByRole('img', { name: 'Scan to join this room' })).toBeVisible();
  for (const width of [320, 390, 520, 521, 636, 780, 781, 1000, 1001, 1280, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    const layout = await page.locator('.lobby-players').evaluate((element) => {
      const cards = Array.from(element.querySelectorAll('.player-card'), (card) => card.getBoundingClientRect());
      const grid = element.getBoundingClientRect();
      const qr = document.querySelector('.qr-wrap')!.getBoundingClientRect();
      const join = document.querySelector('.join-card')!.getBoundingClientRect();
      return {
        widthDifference: Math.abs(cards[0].width - cards[1].width),
        heightDifference: Math.abs(cards[0].height - cards[1].height),
        columns: getComputedStyle(element).gridTemplateColumns.split(' ').length,
        horizontalGap: cards[1].left - cards[0].right,
        verticalGap: cards[1].top - cards[0].bottom,
        fits: cards.every((card) => card.left >= grid.left && card.right <= grid.right),
        qrFits: qr.left >= join.left && qr.right <= join.right,
        overflow: document.documentElement.scrollWidth > window.innerWidth,
      };
    });
    expect(layout.widthDifference, `${width}px: equal card width`).toBeLessThan(1);
    expect(layout.heightDifference, `${width}px: equal card height`).toBeLessThan(1);
    expect(layout.columns).toBe(width <= 520 ? 1 : 2);
    expect(width <= 520 ? layout.verticalGap : layout.horizontalGap).toBeCloseTo(14, 0);
    expect(layout.fits).toBe(true);
    expect(layout.qrFits).toBe(true);
    expect(layout.overflow).toBe(false);
  }
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('Settings supports keyboard and touch without exposing the timer until expanded', async ({ page }, testInfo) => {
  await showRoom(page, snapshot());
  const summary = page.locator('.lobby-settings summary');
  const checkbox = page.getByRole('checkbox', { name: /Extended answer time/ });
  await expect(page.getByText('Extended answer time')).toBeHidden();
  if (testInfo.project.name === 'phone') await summary.tap();
  else {
    await page.getByRole('button', { name: 'Copy join link' }).focus();
    await page.keyboard.press('Tab');
    await expect(summary).toBeFocused();
    await page.keyboard.press('Enter');
  }
  await expect(checkbox).toBeVisible();
  await expect(checkbox).toBeEnabled();
  if (testInfo.project.name === 'phone') await checkbox.tap();
  else {
    await page.keyboard.press('Tab');
    await expect(checkbox).toBeFocused();
    await page.keyboard.press('Space');
  }
  await expect(checkbox).toBeChecked();
  await expect(page.getByText('15 seconds', { exact: true })).toBeVisible();
  await expect(page.locator('.lobby-settings')).toHaveAttribute('open', '');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await summary.focus();
  await page.keyboard.press('Space');
  await expect(checkbox).toBeHidden();
});

test('lobby scrolls only when its content needs more than the viewport', async ({ page }, testInfo) => {
  await showRoom(page, snapshot());
  for (const viewport of [{ width: 1280, height: 720 }, { width: 1440, height: 900 }, { width: 1920, height: 1080 }]) {
    await page.setViewportSize(viewport);
    for (const expanded of [false, true]) {
      if (expanded) await page.locator('.lobby-settings summary').click();
      expect(await page.evaluate(() => document.documentElement.scrollHeight), `${viewport.width}×${viewport.height}, settings ${expanded}`).toBeLessThanOrEqual(viewport.height);
      if (expanded) await page.locator('.lobby-settings summary').click();
    }
  }
  for (const viewport of [{ width: 1280, height: 480 }, { width: 390, height: 700 }]) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeGreaterThan(viewport.height);
    const summary = page.locator('.lobby-settings summary');
    const checkbox = page.getByRole('checkbox', { name: /Extended answer time/ });
    if (testInfo.project.name === 'phone') {
      await summary.tap();
      await checkbox.tap();
    } else {
      await summary.focus();
      await page.keyboard.press('Enter');
      await page.keyboard.press('Tab');
      await expect(checkbox).toBeFocused();
    }
    await expect(checkbox).toBeInViewport();
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    await summary.click();
  }
});

test('occupied and empty seats stay equal while ready players lock Settings', async ({ page }) => {
  const game = snapshot();
  game.players[0] = { ...game.players[0], sticker: 'tiger', ready: true };
  await showRoom(page, game);
  for (const width of [390, 636, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const cards = page.locator('.lobby-players .player-card');
    const a = (await cards.nth(0).boundingBox())!;
    const b = (await cards.nth(1).boundingBox())!;
    expect(a.width).toBeCloseTo(b.width, 0);
    expect(a.height).toBeCloseTo(b.height, 0);
  }
  await page.locator('.lobby-settings summary').click();
  const checkbox = page.getByRole('checkbox', { name: /Extended answer time/ });
  await expect(checkbox).toBeDisabled();
  await expect(checkbox).toHaveAccessibleDescription('Answer time is locked once a player is ready.');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('started games show a clearly labelled current phase with high contrast', async ({ page }) => {
  await showRoom(page, snapshot({ phase: 'learn' }));
  const progress = page.getByRole('list', { name: 'Game progress' });
  await expect(page.getByText('Game progress', { exact: true })).toBeVisible();
  const current = progress.locator('[aria-current="step"]');
  await expect(current).toHaveText('Learn');
  await expect(current).toHaveCSS('background-color', 'rgb(23, 35, 25)');
  await expect(current).toHaveCSS('color', 'rgb(255, 255, 255)');
  await expect(page.locator('.lobby-settings')).toHaveCount(0);
  for (const width of [390, 636, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const boxes = await page.locator('.active-board > *').evaluateAll((elements) => elements.map((element) => {
      const { x, y, width, height } = element.getBoundingClientRect();
      return { x, y, width, height };
    }));
    const [a, center, b] = boxes;
    if (width > 780) {
      expect(a.x + a.width).toBeLessThan(center.x);
      expect(center.x + center.width).toBeLessThan(b.x);
    } else if (width > 520) {
      expect(center.y + center.height).toBeLessThan(a.y);
      expect(a.y).toBe(b.y);
    } else {
      expect(center.y + center.height).toBeLessThan(a.y);
      expect(a.y + a.height).toBeLessThan(b.y);
    }
  }
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
