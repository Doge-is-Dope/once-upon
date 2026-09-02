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
  await page.waitForTimeout(420);
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
  await expect(
    page.locator('.story-header-actions .story-clues-trigger'),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: /^Open clue notebook/ }),
  ).toHaveCount(0);

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
  await expect(
    page.getByRole('button', { name: /^Open clue notebook/ }),
  ).toHaveCount(0);
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
  ).toBeDisabled();
  await expect(page.locator('.pending-move')).toContainText(
    'I inspect the torn edge of the notepad.',
  );
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
  // While the chapter is still being typed the page keeps the next-move
  // prompt and the hint back; both return once the typing settles.
  await expect(page.locator('.story-chapter.is-fresh')).toHaveCount(1);
  await expect(page.locator('.turn-guide')).toHaveCount(0);
  await expect(page.locator('.sheet-typing-status')).toHaveCount(1);
  await expect(
    page.getByRole('button', { name: 'Hint', exact: true }),
  ).toBeDisabled();
  await expect(page.locator('.sheet-finish-typing')).toBeVisible();
  await expect(page.locator('#your-turn')).toHaveCount(1, {
    timeout: 25_000,
  });
  await expect(page.locator('.story-chapter.is-fresh')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Hint', exact: true }),
  ).toBeEnabled();
  await expect(page.locator('.sheet-finish-typing')).toBeHidden();
  const notes = page.getByRole('button', {
    name: 'Open clue notebook',
    exact: true,
  });
  await expect(notes).toBeVisible();
  const notebookPlacement = await page.evaluate(() => {
    const trigger = document
      .querySelector('.story-clues-trigger')!
      .getBoundingClientRect();
    const manuscript = document
      .querySelector('.manuscript')!
      .getBoundingClientRect();
    return {
      rightInset: manuscript.right - trigger.right,
      exposedHeight: trigger.bottom - manuscript.bottom,
    };
  });
  expect(Math.abs(notebookPlacement.rightInset)).toBeLessThan(16);
  expect(notebookPlacement.exposedHeight).toBeGreaterThanOrEqual(44);
});

test('lets the reader finish typing early and shows a refused entry', async ({
  page,
}) => {
  await page.goto(EXPERIENCE_PATH);
  await waitForTool(page, 'get_story_state');
  const initial = await readState(page);
  const hintTrigger = page.getByRole('button', {
    name: 'Hint',
    exact: true,
  });
  const hintIcon = hintTrigger.locator('svg');

  await expect(hintIcon).toHaveCSS(
    'animation-name',
    'story-hint-available-glow',
  );

  const begun = await callTool<ToolResult>(page, 'begin_story_turn', {
    operationId: operationId('begin_finish'),
    expectedSessionId: initial.sessionId,
    expectedRevision: initial.revision,
    playerChoice: 'I press my palm against the handleless door.',
  });
  await expect(page.locator('.pending-move')).toContainText(
    'I press my palm against the handleless door.',
  );
  await expect(page.locator('.writing-marker')).toContainText(
    'Waiting for your agent to write the next chapter…',
  );
  await expect(hintTrigger).toBeDisabled();
  await expect(hintIcon).toHaveCSS('animation-name', 'none');

  // A commit the record refuses (second person in the official record) is
  // shown to the reader, not only returned to the agent.
  const refused = await callTool<ToolResult>(page, 'commit_story_chapter', {
    operationId: operationId('chapter_refused'),
    expectedSessionId: begun.structuredContent.state.sessionId,
    expectedRevision: begun.structuredContent.state.revision,
    turnId: begun.structuredContent.turnId!,
    title: 'The door',
    prose: 'You press the door. It does not move.',
    recordProse: 'You press the door. It does not move.',
    continuitySummary: 'The door stays shut.',
    discoveryIds: [],
    status: 'continue',
  });
  expect(refused.structuredContent.ok).toBe(false);
  await expect(page.locator('.agent-failure-note')).toContainText(
    'The record refused the last entry. Ask your agent to try again.',
  );

  await commit(
    page,
    begun.structuredContent.state,
    begun.structuredContent.turnId!,
    'The door',
    [],
    'continue',
  );
  await expect(page.locator('.agent-failure-note')).toHaveCount(0);
  await expect(page.locator('.story-chapter.is-fresh')).toHaveCount(1);
  const finish = page.locator('.sheet-finish-typing');
  await expect(finish).toBeVisible();
  await expect(hintIcon).toHaveCSS('animation-name', 'none');
  await finish.click();
  await expect(page.locator('.story-chapter.is-fresh')).toHaveCount(0);
  await expect(page.locator('#your-turn')).toHaveCount(1);
  await expect(
    page.getByRole('heading', { name: 'What do you do next?' }),
  ).toBeVisible();
  await expect(page.locator('.typing-caret')).toBeHidden();
  await expect(hintTrigger).toBeEnabled();
  await expect(hintIcon).toHaveCSS(
    'animation-name',
    'story-hint-available-glow',
  );
});

test('shows the final header title at narrow width with reduced motion', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 641, height: 800 });
  await page.goto(EXPERIENCE_PATH);
  await waitForTool(page, 'get_story_state');
  const initial = await readState(page);
  const hintIcon = page
    .getByRole('button', { name: 'Hint', exact: true })
    .locator('svg');

  await expect(hintIcon).toHaveCSS('animation-name', 'none');

  await expect(
    page.locator('.title-block').getByRole('heading', {
      name: 'The Last Manuscript',
    }),
  ).toHaveCSS('font-size', '25.6px');

  const begun = await callTool<ToolResult>(page, 'begin_story_turn', {
    operationId: operationId('begin_reduced_header'),
    expectedSessionId: initial.sessionId,
    expectedRevision: initial.revision,
    playerChoice: 'I inspect the torn edge of the notepad.',
  });

  const headerTitle = page.locator('.story-header-title');
  const headerTitleText = page.locator('.story-header-title-text');
  const actions = page.locator('.story-header-actions');
  const notes = page.getByRole('button', {
    name: 'Open clue notebook',
    exact: true,
  });
  await expect(headerTitle).toBeVisible();
  await expect(headerTitleText).toHaveCSS('animation-name', 'none');
  await expect(headerTitleText).toHaveCSS('clip-path', 'inset(0px)');
  const titleBounds = await headerTitle.boundingBox();
  const actionBounds = await actions.boundingBox();
  expect(titleBounds!.x + titleBounds!.width).toBeLessThanOrEqual(
    actionBounds!.x,
  );
  await expect(
    page.locator('.story-header-actions .story-clues-trigger'),
  ).toHaveCount(0);
  await expect(notes).toHaveCount(0);
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
  await expect(notes).toBeVisible();
  expect(
    await notes.evaluate((element) => {
      const notesBounds = element.getBoundingClientRect();
      const indicatorBounds = document
        .querySelector('.sheet-page-indicator')!
        .getBoundingClientRect();
      return !(
        notesBounds.right <= indicatorBounds.left ||
        notesBounds.left >= indicatorBounds.right ||
        notesBounds.bottom <= indicatorBounds.top ||
        notesBounds.top >= indicatorBounds.bottom
      );
    }),
  ).toBe(false);

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

test('keeps a player-safe clue journal and acknowledges new clues on close', async ({
  page,
}) => {
  await page.goto(EXPERIENCE_PATH);
  await waitForTool(page, 'get_story_state');
  let state = await readState(page);
  const stage = page.locator('.story-manuscript-stage');
  const trigger = stage.locator('.story-clues-trigger');
  const popover = page.locator('#story-clues-popover');
  const sheet = page.locator('.story-clues-sheet');
  const pageIndicator = page.locator('.sheet-page-indicator');

  await expect(trigger).toHaveCount(0);
  state = await ordinaryTurn(
    page,
    state,
    'I study the torn edge and listen to the tapping behind the wardrobe.',
    [],
    'The first observations',
  );

  await expect(
    page.locator('.story-header-actions .story-clues-trigger'),
  ).toHaveCount(0);
  await expect(page.locator('.sheet-pager .story-clues-trigger')).toHaveCount(
    0,
  );
  await expect(trigger).toHaveCount(1);
  await expect(trigger).toHaveText('Notes');
  await expect(trigger).toHaveAttribute('aria-label', 'Open clue notebook');
  await expect(trigger).toHaveAttribute('aria-controls', 'story-clues-popover');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(trigger).not.toHaveAttribute('data-new', 'true');
  await expect(trigger).not.toContainText(/\d/);
  await expect(popover).toBeHidden();
  await trigger.press('Enter');
  await expect(popover).toBeVisible();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(
    sheet.getByRole('button', { name: 'Close notes' }),
  ).toBeFocused();
  await expect(sheet).toContainText('Notes from the room · 2 found');
  await expect(sheet.locator('.story-clue-state')).toHaveText([
    'Noted',
    'Noted',
  ]);
  await expect(sheet.getByRole('button')).toHaveCount(1);
  expect(await sheet.innerText()).not.toMatch(
    /reveal_pressed_words|pencil_found|sixth_attempt_note|North Station reads 183\/184/,
  );
  const indicatorBefore = await pageIndicator.textContent();
  await page.keyboard.press('ArrowRight');
  expect(await pageIndicator.textContent()).toBe(indicatorBefore);
  await page.keyboard.press('Escape');
  await expect(popover).toBeHidden();
  await expect(trigger).toBeFocused();

  state = await ordinaryTurn(
    page,
    state,
    'I search beneath the desk and find the pencil.',
    ['pencil_found'],
    'The pencil beneath the desk',
  );
  await waitForTool(page, 'reveal_pressed_words');
  await expect(trigger).toHaveAttribute(
    'aria-label',
    'Open clue notebook, new note available',
  );
  await expect(trigger).toHaveAttribute('data-new', 'true');
  await trigger.click();
  await expect(sheet).toContainText('Notes from the room · 3 found');
  await expect(sheet.locator('.story-clue-entry').first()).toContainText(
    'The Pencil',
  );
  await expect(sheet.locator('.story-clue-entry').first()).toContainText('New');
  await expect(sheet).toContainText(
    'Turn the pencil sideways and shade across the shallow grooves on the blank page.',
  );
  expect(await sheet.innerText()).not.toMatch(
    /reveal_pressed_words|pencil_found|sixth_attempt_note|Sixth time/,
  );

  await popover.click({ position: { x: 8, y: 180 } });
  await expect(popover).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute('aria-label', 'Open clue notebook');
  await expect(trigger).not.toHaveAttribute('data-new', 'true');
  await trigger.click();
  await expect(sheet.locator('.story-clue-entry').first()).toContainText(
    'Noted',
  );
  await expect(sheet.locator('.story-clue-entry[data-new="true"]')).toHaveCount(
    0,
  );
  const violations = await new AxeBuilder({ page }).analyze();
  expect(violations.violations).toEqual([]);
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
      animationDuration: iconStyle.animationDuration,
      animationIterationCount: iconStyle.animationIterationCount,
      animationName: iconStyle.animationName,
      backgroundColor: buttonStyle.backgroundColor,
      borderColor: buttonStyle.borderColor,
      iconFilter: iconStyle.filter,
    };
  });
  expect(hintAppearance.animationDuration).toBe('0.9s');
  expect(hintAppearance.animationIterationCount).toBe('1');
  expect(hintAppearance.animationName).toBe('story-hint-available-glow');
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
    'Look closer at something on the page, answer the speaker, or test the door.',
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
  await expect(pageIndicator).toHaveText(/Page \d+ of \d+/);
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
  await expect(hero).toBeVisible();
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
  const debugMode = page.getByRole('checkbox', { name: 'Tool inspector' });

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
  const reset = page.getByRole('button', { name: 'Start over', exact: true });
  await expect(reset).toBeVisible();
  await expect(reset).toHaveCSS('text-align', 'center');
  await expect(page.locator('.settings-restart-confirm')).toHaveCount(0);
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
    page.locator('.completion-passage.is-fresh .tw-word'),
  ).not.toHaveCount(0);
  await page.getByRole('button', { name: 'Previous page' }).click();
  await page.waitForTimeout(650);
  const pageHeldDuringRewrite = Number(
    (await page.locator('.sheet-page-indicator').innerText()).match(/\d+/)?.[0],
  );
  await page.locator('.sheet-finish-typing').click();
  await expect(
    page.getByRole('textbox', { name: 'Manuscript copy link' }),
  ).toHaveCount(0);
  await expect(page.locator('.backspace-replacement')).toBeVisible({
    timeout: 30_000,
  });
  const rewriteSamples: string[] = [];
  for (let sample = 0; sample < 3; sample += 1) {
    rewriteSamples.push(
      (await page.locator('.backspace-visual').textContent()) ?? '',
    );
    await page.waitForTimeout(80);
  }
  expect(
    rewriteSamples.every((text) => text.includes('By the next corner')),
  ).toBe(true);
  expect(new Set(rewriteSamples).size).toBeGreaterThan(1);
  await expect(page.locator('del, ins')).toHaveCount(0);
  await expect(
    page.getByRole('textbox', { name: 'Manuscript copy link' }),
  ).toHaveCount(0);
  await expect(page.locator('.backspace-replacement')).toHaveCount(0, {
    timeout: 15_000,
  });
  await expect(page.locator('.sheet-page-indicator')).toContainText(
    `Page ${pageHeldDuringRewrite} of`,
  );
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
  const pageCountBeforeShare =
    (await page.locator('.sheet-page-indicator').textContent()) ?? '';
  // Nothing is uploaded until the reader asks for a copy.
  await expect(publicLink).toHaveCount(0);
  await expect(
    page.getByText('Nothing is uploaded until you choose to.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Create a link' }).click();
  await expect(publicLink).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.sheet-page-indicator')).toHaveText(
    pageCountBeforeShare,
  );
  await page.getByRole('button', { name: /^Open clue notebook/ }).click();
  await expect(page.locator('.story-clue-entry')).toHaveCount(6);
  await expect(page.locator('.story-clue-lead')).toHaveCount(0);
  await page.keyboard.press('Escape');
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
  expect(
    await publicLink.evaluate((element) =>
      element.closest('.sheet-footer')?.classList.contains('sheet-footer'),
    ),
  ).toBe(true);
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
  await reader.setViewportSize({ width: 360, height: 800 });
  const response = await reader.goto(publicUrl);
  expect(response?.headers()['cache-control']).toContain('no-store');
  await expect(
    reader.getByRole('heading', { level: 1, name: 'The Last Manuscript' }),
  ).toBeVisible();
  await expect(reader.locator('[data-support-restricted]')).toHaveCount(0);
  expect(
    await reader.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
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
  await expect(
    page.getByRole('button', { name: /^Open clue notebook/ }),
  ).toHaveCount(0);
  await expect(page.locator('.story-clues-sheet')).toHaveCount(0);

  const stale = await callTool<ToolResult>(page, 'begin_story_turn', {
    operationId: operationId('stale'),
    expectedSessionId: oldSessionId,
    expectedRevision: 1,
    playerChoice: 'I touch the door.',
  });
  expect(stale.structuredContent.code).toBe('STALE_SESSION');

  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Start over', exact: true }).click();
  await expect(page.locator('.settings-restart-confirm')).toContainText(
    'Erase this manuscript and start again?',
  );
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.locator('.settings-restart-confirm')).toHaveCount(0);
  await page.getByRole('button', { name: 'Start over', exact: true }).click();
  await Promise.all([
    page.waitForEvent('load'),
    page.locator('.settings-restart-button.is-confirm').click(),
  ]);
  await waitForTool(page, 'get_story_state');
  const restarted = await readState(page);
  expect(restarted.sessionId).not.toBe(fresh.sessionId);
  expect(restarted.revision).toBe(1);
  await expect(
    page.getByRole('button', { name: /^Open clue notebook/ }),
  ).toHaveCount(0);
  await expect(page.locator('.story-clues-sheet')).toHaveCount(0);
});

test('keeps the manuscript usable at narrow width, zoom, and reduced motion', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 641, height: 800 });
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
  let state = await readState(page);
  await expect(
    page.getByRole('button', { name: /^Open clue notebook/ }),
  ).toHaveCount(0);
  state = await ordinaryTurn(
    page,
    state,
    'I inspect the torn edge before answering the speaker.',
    [],
    'The torn edge',
  );
  expect(state.phase).toBe('READY');
  const notesTrigger = page.getByRole('button', {
    name: 'Open clue notebook',
    exact: true,
  });
  await notesTrigger.scrollIntoViewIfNeeded();
  const notebookLayout = await page.evaluate(() => {
    const trigger = document
      .querySelector('.story-clues-trigger')!
      .getBoundingClientRect();
    const manuscript = document
      .querySelector('.manuscript')!
      .getBoundingClientRect();
    const controls = document
      .querySelector('.sheet-controls')!
      .getBoundingClientRect();
    return {
      trigger: {
        x: trigger.x,
        right: trigger.right,
        bottom: trigger.bottom,
        width: trigger.width,
        height: trigger.height,
      },
      manuscriptBottom: manuscript.bottom,
      controlsBottom: controls.bottom,
    };
  });
  expect(notebookLayout.trigger.x).toBeGreaterThanOrEqual(0);
  expect(notebookLayout.trigger.right).toBeLessThanOrEqual(641);
  expect(notebookLayout.trigger.width).toBeGreaterThanOrEqual(44);
  expect(notebookLayout.trigger.height).toBeGreaterThanOrEqual(44);
  expect(
    notebookLayout.trigger.bottom - notebookLayout.manuscriptBottom,
  ).toBeGreaterThanOrEqual(44);
  expect(notebookLayout.controlsBottom).toBeLessThanOrEqual(
    notebookLayout.manuscriptBottom,
  );
  await notesTrigger.click();
  const clueBounds = await page
    .locator('.story-clues-sheet')
    .evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return {
        x: bounds.x,
        right: bounds.right,
        top: bounds.top,
        bottom: bounds.bottom,
      };
    });
  expect(clueBounds.x).toBeGreaterThanOrEqual(0);
  expect(clueBounds.right).toBeLessThanOrEqual(641);
  expect(clueBounds.top).toBeGreaterThanOrEqual(0);
  expect(clueBounds.bottom).toBeLessThanOrEqual(800);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Hint', exact: true }).click();
  const hintBounds = await page
    .locator('#story-hint-panel')
    .evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return { x: bounds.x, right: bounds.right };
    });
  expect(hintBounds.x).toBeGreaterThanOrEqual(0);
  expect(hintBounds.right).toBeLessThanOrEqual(641);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Settings' }).click();
  const panelBounds = await page
    .locator('#story-settings-panel')
    .evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return { x: bounds.x, right: bounds.right };
    });
  expect(panelBounds.x).toBeGreaterThanOrEqual(0);
  expect(panelBounds.right).toBeLessThanOrEqual(641);
  await page.keyboard.press('Escape');
  await page.evaluate(() => {
    document.documentElement.style.zoom = '2';
  });
  await expect(notesTrigger).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole('button', { name: 'Open clue notebook', exact: true })
    .click();
  await expect(page.locator('.story-clues-sheet')).toBeVisible();
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

test('repaginates when only the viewport height changes', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 800, height: 900 });
  await page.goto(EXPERIENCE_PATH);
  await waitForTool(page, 'get_story_state');
  let state = await readState(page);
  state = await ordinaryTurn(
    page,
    state,
    'I search the desk drawers.',
    [],
    'The desk',
  );
  await ordinaryTurn(page, state, 'I examine the bed frame.', [], 'The bed');
  await expectPaginationToMatchLayout(page);

  // A height-only change (mobile URL bar, keyboard, window resize)
  // re-fragments every column. The pager used to re-measure only on
  // width changes, leaving a stale page count and clipped columns.
  await page.setViewportSize({ width: 800, height: 540 });
  await page.waitForTimeout(350);
  await expectPaginationToMatchLayout(page);
  expect(
    await page.locator('.sheet-pager').evaluate((pager) => {
      const gap =
        Number.parseFloat(
          getComputedStyle(pager).getPropertyValue('--page-gap-rem'),
        ) *
        Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
      const stride = pager.getBoundingClientRect().width + gap;
      const offset = pager.scrollLeft % stride;
      return Math.min(offset, stride - offset);
    }),
  ).toBeLessThan(2);

  await page.setViewportSize({ width: 800, height: 900 });
  await page.waitForTimeout(350);
  await expectPaginationToMatchLayout(page);
});

test('keeps every surface inside short desktop columns through the ending', async ({
  page,
}) => {
  test.slow();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 641, height: 640 });
  await page.goto(EXPERIENCE_PATH);
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
  // The torn notepad cannot fragment, so it must fit one short column.
  await scrollSheetToElement(page.locator('.notepad-artifact'));
  await expectElementInsideActiveSheet(page.locator('.notepad-artifact'));

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
    'I pull the wardrobe aside and take the sewn papers from the recess.',
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

  // Sharing stays in the fixed footer while the final record remains in
  // the real page flow.
  await expect(page.locator('.ending-share')).toBeVisible();
  await waitForSheetToSettle(page);
  await expectPaginationToMatchLayout(page);
  const lastParagraph = page.locator('.completion-passage p').last();
  await scrollSheetToElement(lastParagraph);
  await expect(lastParagraph).toContainText('The subject continues walking.');
  await expectElementInsideActiveSheet(lastParagraph);
  await page.getByRole('button', { name: /^Open clue notebook/ }).click();
  await expect(page.locator('.story-clues-sheet')).toBeVisible();
  await expect(page.locator('.story-clue-entry')).toHaveCount(6);
  await expect(page.locator('.story-clue-lead')).toHaveCount(0);
  await page.keyboard.press('Escape');
});

/** Resolves once the pager's scroll position holds still across two
 *  consecutive samples, so app-driven page turns have finished. */
async function waitForSheetToSettle(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const pager = document.querySelector('.sheet-pager');
      if (!pager) return false;
      const holder = window as unknown as { __settleScroll?: number };
      const previous = holder.__settleScroll;
      holder.__settleScroll = pager.scrollLeft;
      return previous !== undefined && previous === pager.scrollLeft;
    },
    undefined,
    { polling: 250 },
  );
}

/**
 * Aligns the pager to the start of the page containing the element,
 * mirroring the app's own floor(left / stride) page math.
 * scrollIntoViewIfNeeded is unsafe here: it leaves the pager between
 * snap rails and the mandatory snap re-settles it under the assertion.
 */
async function scrollSheetToElement(element: Locator): Promise<void> {
  await element.evaluate((node) => {
    const pager = node.closest('.sheet-pager')!;
    const gap =
      Number.parseFloat(
        getComputedStyle(pager).getPropertyValue('--page-gap-rem'),
      ) *
      Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
    const stride = pager.getBoundingClientRect().width + gap;
    const left =
      node.getBoundingClientRect().left -
      pager.getBoundingClientRect().left +
      pager.scrollLeft;
    pager.scrollTo({ left: Math.floor((left + 1) / stride) * stride });
  });
}

async function expectElementInsideActiveSheet(element: Locator): Promise<void> {
  const geometry = await element.evaluate((node) => {
    const pager = node.closest('.sheet-pager');
    if (!pager) return { inside: false, reason: 'no pager ancestor' };
    const elementRect = node.getBoundingClientRect();
    const pagerRect = pager.getBoundingClientRect();
    return {
      inside:
        elementRect.left >= pagerRect.left - 1 &&
        elementRect.right <= pagerRect.right + 1 &&
        elementRect.top >= pagerRect.top - 1 &&
        elementRect.bottom <= pagerRect.bottom + 1,
      element: {
        left: elementRect.left,
        right: elementRect.right,
        top: elementRect.top,
        bottom: elementRect.bottom,
      },
      pager: {
        left: pagerRect.left,
        right: pagerRect.right,
        top: pagerRect.top,
        bottom: pagerRect.bottom,
        scrollLeft: pager.scrollLeft,
      },
    };
  });
  expect(geometry, JSON.stringify(geometry)).toMatchObject({ inside: true });
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
      count: Math.max(
        1,
        Math.round(
          ((pager.querySelector('.sheet-flow')?.scrollWidth ?? 0) + gap) /
            stride,
        ),
      ),
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
