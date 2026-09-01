import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { experienceDefinition } from '../experiences/the-last-manuscript/definition';
import { makeCompleteShareSubmission } from '../tests/support/share-fixtures';
import {
  callTool,
  installModelContextMock,
  waitForTool,
} from './support/webmcp-mock';

const EXPERIENCE_PATH = '/experiences/the-last-manuscript';

type StoryState = {
  phase: 'READY' | 'AWAITING_CHAPTER' | 'COMPLETE';
  revision: number;
  sessionId: string;
  pending: null | {
    turnId: string;
    effectReceipt: null | {
      receiptId: string;
      factIds: string[];
    };
  };
};

type ToolResult = {
  structuredContent: {
    ok: boolean;
    code?: string;
    state: StoryState;
    turnId?: string;
    effectReceipt?: { receiptId: string; factIds: string[] };
  };
};

test.beforeEach(async ({ page }) => {
  await installModelContextMock(page, {
    globalName: '__webMCPTools',
    dispatchToolChange: true,
    registrationBudget: 6,
  });
});

test('moves from the opening hero into the manuscript after the first choice', async ({
  page,
}) => {
  await page.goto(EXPERIENCE_PATH);
  await waitForTool(page, 'get_story_state');
  const initial = await readState(page);
  const hero = page.locator('.title-block');
  const headerTitle = page.locator('.story-header-title');
  const headerTitleText = page.locator('.story-header-title-text');
  const settings = page.getByRole('button', { name: 'Settings', exact: true });
  const logoBoundsBefore = await page.locator('.once-upon-mark').boundingBox();
  const settingsBoundsBefore = await settings.boundingBox();
  const manuscriptBoundsBefore = await page
    .locator('.manuscript')
    .boundingBox();

  await expect(hero).toBeVisible();
  await expect(
    hero.getByRole('heading', { name: 'The Last Manuscript' }),
  ).toHaveCSS('font-size', '44px');
  await expect(headerTitle).toBeHidden();
  await expect(headerTitle).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('.frame-book')).not.toHaveAttribute(
    'data-story-started',
  );
  await expect(
    page.getByRole('button', { name: 'Hint', exact: true }),
  ).toBeVisible();

  const begun = await callTool<ToolResult>(page, 'begin_story_turn', {
    operationId: operationId('begin_immersive'),
    expectedSessionId: initial.sessionId,
    expectedRevision: initial.revision,
    playerChoice: 'I inspect the torn edge of the notepad.',
  });

  await page.waitForTimeout(160);
  const manuscriptBoundsDuring = await page
    .locator('.manuscript')
    .boundingBox();
  expect(manuscriptBoundsDuring!.y).toBeLessThan(manuscriptBoundsBefore!.y);
  await expect(hero).toBeHidden();
  await expect(page.locator('.frame-book')).toHaveAttribute(
    'data-story-started',
    'true',
  );
  await expect(page.locator('.story-shell > h1.sr-only')).toHaveText(
    'The Last Manuscript',
  );
  await expect(
    page.getByRole('heading', { level: 1, name: 'The Last Manuscript' }),
  ).toHaveCount(1);
  await expect(headerTitle).toBeVisible();
  await expect(headerTitle).toHaveText('The Last Manuscript');
  await expect(headerTitle).toHaveCSS('font-size', '15.2px');
  await expect(headerTitleText).toHaveCSS(
    'animation-name',
    'story-header-title-type',
  );
  const logoBoundsAfter = await page.locator('.once-upon-mark').boundingBox();
  const settingsBoundsAfter = await settings.boundingBox();
  expect(logoBoundsAfter!.x).toBeCloseTo(logoBoundsBefore!.x, 1);
  expect(logoBoundsAfter!.y).toBeCloseTo(logoBoundsBefore!.y, 1);
  expect(settingsBoundsAfter!.x).toBeCloseTo(settingsBoundsBefore!.x, 1);
  expect(settingsBoundsAfter!.y).toBeCloseTo(settingsBoundsBefore!.y, 1);
  await expect(
    page.getByRole('button', { name: 'Hint', exact: true }),
  ).toHaveCount(0);
  await page.waitForTimeout(1250);
  await expect(headerTitleText).toHaveCSS('clip-path', 'inset(0px 0% 0px 0px)');
  await expect(page.locator('.story-header-title-caret')).toHaveCSS(
    'opacity',
    '0',
  );

  await commit(
    page,
    begun.structuredContent.state,
    begun.structuredContent.turnId!,
    'The torn edge',
    [],
    'continue',
  );
  await expect(hero).toBeHidden();
  await expect(headerTitle).toBeVisible();
  await expect(headerTitleText).toHaveCSS('clip-path', 'inset(0px 0% 0px 0px)');
  await expect(
    page.getByRole('button', { name: 'Hint', exact: true }),
  ).toBeVisible();
});

test('shows the final header title at narrow width with reduced motion', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto(EXPERIENCE_PATH);
  await waitForTool(page, 'get_story_state');
  const initial = await readState(page);

  await expect(
    page.locator('.title-block').getByRole('heading', {
      name: 'The Last Manuscript',
    }),
  ).toHaveCSS('font-size', '28px');

  const begun = await callTool<ToolResult>(page, 'begin_story_turn', {
    operationId: operationId('begin_reduced_header'),
    expectedSessionId: initial.sessionId,
    expectedRevision: initial.revision,
    playerChoice: 'I inspect the torn edge of the notepad.',
  });

  const headerTitle = page.locator('.story-header-title');
  const headerTitleText = page.locator('.story-header-title-text');
  const actions = page.locator('.story-header-actions');
  await expect(headerTitle).toBeVisible();
  await expect(headerTitleText).toHaveCSS('animation-name', 'none');
  await expect(headerTitleText).toHaveCSS('clip-path', 'inset(0px)');
  const titleBounds = await headerTitle.boundingBox();
  const actionBounds = await actions.boundingBox();
  expect(titleBounds!.x + titleBounds!.width).toBeLessThanOrEqual(
    actionBounds!.x,
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await commit(
    page,
    begun.structuredContent.state,
    begun.structuredContent.turnId!,
    'The torn edge',
    [],
    'continue',
  );

  await page.evaluate(() => {
    document.documentElement.style.zoom = '2';
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  // The sheet pager is intentionally controlled by the document-level arrow
  // keys and external page buttons; that contract has its own keyboard E2E.
  const violations = await new AxeBuilder({ page })
    .disableRules(['scrollable-region-focusable'])
    .analyze();
  expect(violations.violations).toEqual([]);
});

test('keeps the prologue in view while the connection settles', async ({
  page,
}) => {
  await page.goto(EXPERIENCE_PATH);
  await waitForTool(page, 'get_story_state');
  await expect(
    page.getByRole('heading', {
      name: experienceDefinition.story.prologue.title,
    }),
  ).toBeVisible();
  // The WebMCP status flip used to re-run the pager navigation effect and
  // turn straight to the last page, hiding the prologue; the pager must
  // stay on page one.
  await page.waitForTimeout(700);
  expect(
    await page
      .locator('.sheet-pager')
      .evaluate((element) => element.scrollLeft),
  ).toBe(0);
});

test('reveals the contextual hint from the header without repaginating', async ({
  page,
}) => {
  await page.goto(EXPERIENCE_PATH);
  await waitForTool(page, 'get_story_state');

  const trigger = page.getByRole('button', { name: 'Hint', exact: true });
  const panel = page.locator('#story-hint-panel');
  const indicator = page.locator('.sheet-page-indicator');
  const pager = page.locator('.sheet-pager');
  const initialIndicator = await indicator.textContent();
  const initialScrollLeft = await pager.evaluate(
    (element) => element.scrollLeft,
  );

  await expect(trigger).toBeVisible();
  await expect(trigger).toHaveAttribute('data-available', 'true');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  const hintAppearance = await trigger.evaluate((button) => {
    const buttonStyle = getComputedStyle(button);
    const iconStyle = getComputedStyle(button.querySelector('svg')!);
    return {
      backgroundColor: buttonStyle.backgroundColor,
      borderColor: buttonStyle.borderColor,
      iconFilter: iconStyle.filter,
    };
  });
  expect(hintAppearance.backgroundColor).toBe('rgba(0, 0, 0, 0)');
  expect(hintAppearance.borderColor).toBe('rgba(0, 0, 0, 0)');
  expect(hintAppearance.iconFilter).toContain('drop-shadow');
  await expect(panel).toBeHidden();
  await expect(page.locator('.turn-guide details')).toHaveCount(0);
  await expect(page.locator('[role="menu"], [role="dialog"]')).toHaveCount(0);

  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText(
    'Look closer at something already on the page, speak to someone, or test a way forward.',
  );
  await expect(indicator).toHaveText(initialIndicator!);
  expect(await pager.evaluate((element) => element.scrollLeft)).toBe(
    initialScrollLeft,
  );
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(trigger).toBeFocused();

  await trigger.click();
  await page.locator('.once-upon-mark').click();
  await expect(panel).toBeHidden();
});

test('turns pages from the keyboard without outlining the manuscript container', async ({
  page,
}) => {
  await page.goto(EXPERIENCE_PATH);
  await waitForTool(page, 'get_story_state');

  const manuscript = page.locator('.story-shell');
  await manuscript.focus();
  await expect(manuscript).toBeFocused();
  await expect(manuscript).toHaveCSS('outline-style', 'none');

  const pageIndicator = page.locator('.sheet-page-indicator');
  const hero = page.locator('.title-block');
  await expect(hero).toBeVisible();
  await expect(pageIndicator).toHaveText(/Sheet \d+ of \d+/);
  const initialIndicator = await pageIndicator.innerText();
  const currentPage = Number(initialIndicator.match(/\d+/)?.[0]);

  await page.locator('.once-upon-mark').click();
  await expect(manuscript).not.toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect
    .poll(async () =>
      Number((await pageIndicator.innerText()).match(/\d+/)?.[0]),
    )
    .toBe(currentPage + 1);
  await expect(hero).toBeHidden();
  await expect(
    page.getByRole('heading', { level: 1, name: 'The Last Manuscript' }),
  ).toHaveCount(1);
  await page.keyboard.press('ArrowLeft');
  await expect
    .poll(async () =>
      Number((await pageIndicator.innerText()).match(/\d+/)?.[0]),
    )
    .toBe(currentPage);
  await expect(hero).toBeVisible();
  await expect(
    page.getByRole('heading', { level: 1, name: 'The Last Manuscript' }),
  ).toHaveCount(1);
});

test('opens and dismisses the accessible settings panel', async ({ page }) => {
  await page.goto(EXPERIENCE_PATH);
  await waitForTool(page, 'get_story_state');

  const trigger = page.getByRole('button', { name: 'Settings', exact: true });
  const backdrop = page.locator('.settings-backdrop');
  const panel = page.locator('#story-settings-panel');
  const debugMode = page.getByRole('checkbox', { name: 'Debug mode' });

  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(panel).toBeHidden();

  await trigger.focus();
  await trigger.press('Enter');
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(panel).toBeVisible();
  await expect(backdrop).toBeVisible();
  await expect(backdrop).toHaveCSS(
    'backdrop-filter',
    'blur(4px) saturate(0.86)',
  );
  const reset = page.getByRole('button', { name: 'Reset', exact: true });
  await expect(reset).toBeVisible();
  await expect(reset).toHaveCSS('text-align', 'center');
  await expect(page.getByRole('heading', { name: 'Settings' })).toHaveCSS(
    'text-transform',
    'none',
  );

  await debugMode.click();
  await expect(panel).toBeVisible();
  await expect(page.locator('.webmcp-inspector')).toBeVisible();

  await backdrop.click({ position: { x: 20, y: 120 } });
  await expect(panel).toBeHidden();
  await expect(backdrop).toBeHidden();

  await trigger.click();
  await expect(panel).toBeVisible();
  const violations = await new AxeBuilder({ page }).analyze();
  expect(violations.violations).toEqual([]);
  await trigger.click();
  await expect(panel).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('completes the story within six registrations and shares a unique story link', async ({
  page,
  context,
}) => {
  test.slow();
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (data: ShareData) => {
        (window as unknown as { __nativeShare?: ShareData }).__nativeShare =
          data;
      },
    });
  });
  const shareClientAddress = `completion-${crypto.randomUUID()}`;
  await page.route('**/api/shared-stories', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    await route.continue({
      headers: {
        ...route.request().headers(),
        'cf-connecting-ip': shareClientAddress,
      },
    });
  });
  await page.goto(EXPERIENCE_PATH);
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin: new URL(page.url()).origin,
  });
  await waitForTool(page, 'get_story_state');

  let state = await readState(page);
  state = await ordinaryTurn(
    page,
    state,
    'I search the table and find a pencil.',
    ['pencil_found'],
    'A pencil by the notepad',
  );
  await waitForTool(page, 'reveal_pressed_words');
  state = await interactionTurn(
    page,
    state,
    'reveal_pressed_words',
    'I rub the pencil across the notepad to reveal the impressions.',
    'The missing page answers',
    'continue',
  );

  await waitForTool(page, 'follow_north_station_memory');
  state = await interactionTurn(
    page,
    state,
    'follow_north_station_memory',
    'I close my eyes and begin with the remembered station announcement.',
    'Memory at 5:41',
    'continue',
  );
  state = await ordinaryTurn(
    page,
    state,
    'I pull the wardrobe aside and take the sewn papers from the maintenance recess.',
    ['manuscript_found'],
    'The papers behind the wardrobe',
  );

  await waitForTool(page, 'read_the_last_manuscript');
  state = await interactionTurn(
    page,
    state,
    'read_the_last_manuscript',
    'I open the sewn manuscript and read every page before the door opens.',
    'The corridor beyond Room Seven',
    'complete',
  );
  expect(state.phase).toBe('COMPLETE');
  await expect(
    page.locator('.completion-passage.is-fresh .tw-char'),
  ).not.toHaveCount(0);
  await expect(page.locator('.backspace-replacement')).toHaveCount(0);
  await expect(
    page.getByRole('textbox', { name: 'Manuscript copy link' }),
  ).toHaveCount(0);
  await expect(page.locator('.backspace-replacement')).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.locator('del, ins')).toHaveCount(0);
  await expect(
    page.getByRole('textbox', { name: 'Manuscript copy link' }),
  ).toHaveCount(0);
  await expect(page.locator('.backspace-replacement')).toHaveCount(0, {
    timeout: 15_000,
  });
  const completionParagraphs = page.locator('.completion-passage p');
  await expect(completionParagraphs.first()).toContainText(
    'No alarm follows you. No footsteps come after you.',
  );
  await expect(completionParagraphs.last()).toContainText(
    'The subject continues walking.',
  );
  await expect(page.locator('.story-chapter').first()).toContainText(
    'The question wakes you at a table.',
  );
  await expect(page.getByText('The manuscript rests.')).toHaveCount(0);
  const publicLink = page.getByRole('textbox', {
    name: 'Manuscript copy link',
  });
  await expect(publicLink).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Copy story' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Download .txt' })).toHaveCount(
    0,
  );

  const registrations = await page.evaluate(
    () => window.__webMCPRegistrationHistory,
  );
  expect(registrations).toEqual([
    'get_story_state',
    'begin_story_turn',
    'commit_story_chapter',
    'reveal_pressed_words',
    'follow_north_station_memory',
    'read_the_last_manuscript',
  ]);

  const publicUrl = await publicLink.inputValue();
  expect(publicUrl).toMatch(/\/s\/[A-Za-z0-9_-]{32}$/);
  await expectElementInsideActiveSheet(publicLink);
  await expectPaginationToMatchLayout(page);
  expect(
    await page.evaluate(
      () => (window as unknown as { __nativeShare?: ShareData }).__nativeShare,
    ),
  ).toBeUndefined();

  await page.getByRole('button', { name: 'Copy manuscript link' }).click();
  await expect(
    page.getByRole('button', { name: 'Manuscript link copied' }),
  ).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe(publicUrl);

  const readerContext = await context.browser()!.newContext();
  const reader = await readerContext.newPage();
  const response = await reader.goto(publicUrl);
  expect(response?.headers()['cache-control']).toContain('no-store');
  await expect(
    reader.getByRole('heading', { level: 1, name: 'The Last Manuscript' }),
  ).toBeVisible();
  await expect(
    reader.getByRole('heading', {
      level: 3,
      name: 'The North Station Memory',
    }),
  ).toBeVisible();
  await expect(
    reader.getByText('The Last Manuscript', { exact: true }),
  ).toHaveCount(2);
  await expect(
    reader.getByRole('link', { name: 'Enter Room Seven' }),
  ).toBeVisible();
  await expect(reader.getByText('A recovered record')).toBeVisible();
  await expect(
    reader.getByText(/This read-only copy is available until/),
  ).toBeVisible();
  expect(await reader.locator('body').innerText()).not.toContain('·');
  await expect(reader.locator('del, ins')).toHaveCount(0);
  await expect(reader.locator('.shared-chapter').first()).toContainText(
    'The question wakes you at a table.',
  );
  await expect(reader.locator('.shared-completion p').first()).toContainText(
    'No alarm follows you. No footsteps come after you.',
  );
  await expect(reader.locator('.shared-completion p').last()).toContainText(
    'The subject continues walking.',
  );
  await expect(reader.locator('meta[name="robots"]')).toHaveAttribute(
    'content',
    /noindex/,
  );
  expect(await reader.locator('body').innerText()).not.toMatch(
    /session_|receiptId|interactionId|continuitySummary/,
  );
  expect(await reader.evaluate(() => Boolean(document.modelContext))).toBe(
    false,
  );
  await readerContext.close();

  const violations = await new AxeBuilder({ page }).analyze();
  expect(violations.violations).toEqual([]);
});

test('reload and Reset create a fresh document session', async ({ page }) => {
  await page.goto(EXPERIENCE_PATH);
  await waitForTool(page, 'get_story_state');
  const initial = await readState(page);
  const afterDiscovery = await ordinaryTurn(
    page,
    initial,
    'I find the pencil beside the sink.',
    ['pencil_found'],
    'The pencil',
  );
  await waitForTool(page, 'reveal_pressed_words');
  const pending = await callTool<ToolResult>(page, 'reveal_pressed_words', {
    operationId: operationId('pending'),
    expectedSessionId: afterDiscovery.sessionId,
    expectedRevision: afterDiscovery.revision,
    playerChoice: 'I shade the pressed marks with the pencil.',
  });
  expect(pending.structuredContent.state.phase).toBe('AWAITING_CHAPTER');

  const oldSessionId = pending.structuredContent.state.sessionId;
  await page.reload();
  await waitForTool(page, 'get_story_state');
  const fresh = await readState(page);
  expect(fresh.sessionId).not.toBe(oldSessionId);
  expect(fresh.revision).toBe(1);
  await expect(page.locator('.story-chapter')).toHaveCount(1);
  expect(await page.evaluate(() => window.__webMCPRegistrationHistory)).toEqual(
    ['get_story_state', 'begin_story_turn', 'commit_story_chapter'],
  );

  const stale = await callTool<ToolResult>(page, 'begin_story_turn', {
    operationId: operationId('stale'),
    expectedSessionId: oldSessionId,
    expectedRevision: 1,
    playerChoice: 'I touch the door.',
  });
  expect(stale.structuredContent.code).toBe('STALE_SESSION');

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await Promise.all([
    page.waitForEvent('load'),
    page.getByRole('button', { name: 'Reset' }).click(),
  ]);
  await waitForTool(page, 'get_story_state');
  const restarted = await readState(page);
  expect(restarted.sessionId).not.toBe(fresh.sessionId);
  expect(restarted.revision).toBe(1);
});

test('keeps the manuscript usable at narrow width, zoom, and reduced motion', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto(EXPERIENCE_PATH);
  await waitForTool(page, 'get_story_state');
  await expect(
    page.getByRole('heading', { name: 'The Last Manuscript' }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole('button', { name: 'Hint', exact: true }).click();
  const hintBounds = await page
    .locator('#story-hint-panel')
    .evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return { x: bounds.x, right: bounds.right };
    });
  expect(hintBounds.x).toBeGreaterThanOrEqual(0);
  expect(hintBounds.right).toBeLessThanOrEqual(360);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Settings' }).click();
  const panelBounds = await page
    .locator('#story-settings-panel')
    .evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return { x: bounds.x, right: bounds.right };
    });
  expect(panelBounds.x).toBeGreaterThanOrEqual(0);
  expect(panelBounds.right).toBeLessThanOrEqual(360);
  await page.evaluate(() => {
    document.documentElement.style.zoom = '2';
  });
  await expect(
    page.getByRole('heading', { name: 'The speaker is waiting.' }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(
    await page.evaluate(
      () =>
        getComputedStyle(document.querySelector('.story-chapter')!)
          .animationName,
    ),
  ).toBe('none');
});

test('enforces public-share origin, idempotency, conflict, rate, and text safety', async ({
  page,
  request,
  context,
}) => {
  await page.goto(EXPERIENCE_PATH);
  const allowedOrigin = new URL(page.url()).origin;
  const clientAddress = `test-${crypto.randomUUID()}`;
  const requestId = crypto.randomUUID();
  const submission = makeCompleteShareSubmission(requestId, {
    lastChapterProse: '<img src=x onerror="window.__sharedXss=true">',
  });
  const denied = await request.post('/api/shared-stories', {
    headers: { Origin: 'https://example.invalid' },
    data: submission,
  });
  expect(denied.status()).toBe(403);

  const headers = {
    Origin: allowedOrigin,
    'CF-Connecting-IP': clientAddress,
  };
  const created = await request.post('/api/shared-stories', {
    headers,
    data: submission,
  });
  expect(created.status()).toBe(201);
  const first = (await created.json()) as { path: string; expiresAt: string };
  expect(Date.parse(first.expiresAt) - Date.now()).toBeGreaterThan(
    29 * 24 * 60 * 60 * 1_000,
  );

  const retry = await request.post('/api/shared-stories', {
    headers,
    data: submission,
  });
  expect(retry.status()).toBe(200);
  expect((await retry.json()).path).toBe(first.path);

  const conflict = await request.post('/api/shared-stories', {
    headers,
    data: {
      ...submission,
      chapters: submission.chapters.map((chapter, index) =>
        index === 1 ? { ...chapter, title: 'Conflicting title' } : chapter,
      ),
    },
  });
  expect(conflict.status()).toBe(409);

  for (let index = 0; index < 10; index += 1) {
    const response = await request.post('/api/shared-stories', {
      headers,
      data: makeCompleteShareSubmission(crypto.randomUUID()),
    });
    expect(response.status(), `rate request ${index + 1}`).toBe(
      index < 9 ? 201 : 429,
    );
  }

  const readerContext = await context.browser()!.newContext();
  const reader = await readerContext.newPage();
  await reader.goto(first.path);
  await expect(
    reader.getByText('<img src=x onerror="window.__sharedXss=true">', {
      exact: true,
    }),
  ).toBeVisible();
  expect(
    await reader.evaluate(() =>
      Boolean((window as unknown as { __sharedXss?: boolean }).__sharedXss),
    ),
  ).toBe(false);
  await readerContext.close();
});

async function expectElementInsideActiveSheet(element: Locator): Promise<void> {
  expect(
    await element.evaluate((node) => {
      const pager = node.closest('.sheet-pager');
      if (!pager) return false;
      const elementRect = node.getBoundingClientRect();
      const pagerRect = pager.getBoundingClientRect();
      return (
        elementRect.left >= pagerRect.left - 1 &&
        elementRect.right <= pagerRect.right + 1 &&
        elementRect.top >= pagerRect.top - 1 &&
        elementRect.bottom <= pagerRect.bottom + 1
      );
    }),
  ).toBe(true);
}

async function expectPaginationToMatchLayout(page: Page): Promise<void> {
  const layout = await page.locator('.sheet-pager').evaluate((pager) => {
    const pagerStyle = getComputedStyle(pager);
    const rootFontSize = Number.parseFloat(
      getComputedStyle(document.documentElement).fontSize,
    );
    const gap =
      Number.parseFloat(pagerStyle.getPropertyValue('--page-gap-rem')) *
      rootFontSize;
    const stride = pager.clientWidth + gap;
    return {
      current: Math.round(pager.scrollLeft / stride) + 1,
      count: Math.max(1, Math.round((pager.scrollWidth + gap) / stride)),
    };
  });
  const numbers = (await page.locator('.sheet-page-indicator').innerText())
    .match(/\d+/g)
    ?.map(Number);

  expect(numbers).toEqual([layout.current, layout.count]);
}

async function readState(page: Page): Promise<StoryState> {
  const result = await callTool<ToolResult>(page, 'get_story_state', {});
  return result.structuredContent.state;
}

async function ordinaryTurn(
  page: Page,
  state: StoryState,
  choice: string,
  discoveryIds: string[],
  title: string,
): Promise<StoryState> {
  const begun = await callTool<ToolResult>(page, 'begin_story_turn', {
    operationId: operationId('begin'),
    expectedSessionId: state.sessionId,
    expectedRevision: state.revision,
    playerChoice: choice,
  });
  return commit(
    page,
    begun.structuredContent.state,
    begun.structuredContent.turnId!,
    title,
    discoveryIds,
    'continue',
  );
}

async function interactionTurn(
  page: Page,
  state: StoryState,
  toolName: string,
  choice: string,
  title: string,
  status: 'continue' | 'complete',
): Promise<StoryState> {
  const invoked = await callTool<ToolResult>(page, toolName, {
    operationId: operationId(toolName),
    expectedSessionId: state.sessionId,
    expectedRevision: state.revision,
    playerChoice: choice,
  });
  const receipt = invoked.structuredContent.effectReceipt!;
  return commit(
    page,
    invoked.structuredContent.state,
    invoked.structuredContent.turnId!,
    title,
    [],
    status,
    receipt,
  );
}

async function commit(
  page: Page,
  state: StoryState,
  turnId: string,
  title: string,
  discoveryIds: string[],
  status: 'continue' | 'complete',
  receipt?: { receiptId: string; factIds: string[] },
): Promise<StoryState> {
  const result = await callTool<ToolResult>(page, 'commit_story_chapter', {
    operationId: operationId('chapter'),
    expectedSessionId: state.sessionId,
    expectedRevision: state.revision,
    turnId,
    title,
    prose:
      'You follow the choice through the quiet room and keep each physical detail in view. The wall speaker waits while the notepad, wardrobe, and handleless door remain where you left them. Nothing supplies an answer for you; the next fact comes only from what you examine.',
    recordProse:
      'The subject follows the choice through the quiet room and keeps each physical detail in view. The wall speaker waits while the notepad, wardrobe, and handleless door remain where the subject left them. Nothing supplies an answer for the subject; the next fact comes only from what the subject examines.',
    continuitySummary:
      'You remain in the room with the notepad, wardrobe, wall speaker, and handleless door, following the evidence in the order you found it.',
    discoveryIds,
    status,
    ...(receipt
      ? {
          effectReceiptId: receipt.receiptId,
          representedFactIds: receipt.factIds,
        }
      : {}),
  });
  expect(result.structuredContent.ok).toBe(true);
  return result.structuredContent.state;
}

let operationSequence = 0;
function operationId(prefix: string): string {
  operationSequence += 1;
  return `${prefix.replace(/[^a-z0-9_]/gi, '_')}_${String(operationSequence).padStart(6, '0')}`;
}
