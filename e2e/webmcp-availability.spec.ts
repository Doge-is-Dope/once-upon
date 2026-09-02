import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { installModelContextMock, waitForTool } from './support/webmcp-mock';

const EXPERIENCE_PATH = '/experiences/the-last-manuscript';

test('redacts the first sheet when WebMCP is unavailable', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto(EXPERIENCE_PATH);

  const availability = page.locator('[data-webmcp-availability]');
  await expect(availability).toHaveCount(1);
  await expect(
    page.getByRole('heading', {
      name: 'Access restricted',
    }),
  ).toBeVisible();
  await expect(availability).toContainText(
    'This record can only be continued by an attached agent.',
  );
  await expect(availability).not.toContainText('WebMCP');
  await expect(availability.getByRole('button')).toHaveCount(0);
  await expect(page.locator('.agent-presence')).toHaveCount(0);
  await expect(availability.getByRole('link')).toHaveCount(0);
  await expect(availability.locator('.webmcp-redaction-group')).toHaveCount(
    0,
  );

  // The sheet is censored in place: real prose under real ink.
  const runs = page.locator('.sheet-pager .redacted-run');
  expect(await runs.count()).toBeGreaterThan(0);
  const question = page.locator('.story-chapter > p:nth-of-type(2)');
  await expect(question).toContainText('Please answer');
  await expect(question.locator('.redacted-run')).toHaveCount(0);
  expect(
    await runs.first().evaluate((element) => {
      const style = getComputedStyle(element);
      return { color: style.color, background: style.backgroundColor };
    }),
  ).toEqual({ color: 'rgba(0, 0, 0, 0)', background: 'rgb(32, 26, 19)' });

  const sheetWindow = page.locator('.sheet-window');
  const pager = page.locator('.sheet-pager');
  expect(
    await availability.evaluate((element) =>
      element.parentElement?.classList.contains('sheet-window'),
    ),
  ).toBe(true);
  await expect(sheetWindow).toContainText('Access restricted');
  await expect(pager).toHaveAttribute('inert', '');
  await expect(page.locator('.sheet-page-indicator')).toContainText('Sheet 01');
  await expect(page.locator('.story-chapter h2')).toHaveText(
    'The question at 5:41',
  );
  await expect(
    page.getByRole('heading', { name: 'The question at 5:41' }),
  ).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Previous page' })).toHaveCount(
    0,
  );
  await expect(page.getByRole('button', { name: 'Next page' })).toHaveCount(0);

  const beforeArrow = await pager.evaluate((element) => element.scrollLeft);
  await page.keyboard.press('ArrowRight');
  expect(await pager.evaluate((element) => element.scrollLeft)).toBe(
    beforeArrow,
  );
  expect(
    await pager.evaluate((element) => {
      const style = getComputedStyle(element);
      return { overflowX: style.overflowX, touchAction: style.touchAction };
    }),
  ).toEqual({ overflowX: 'hidden', touchAction: 'none' });

  await expect(page.locator('#your-turn, .writing-marker')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Hint', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Copy example message' }),
  ).toHaveCount(0);
  await expect(page.locator('[role="alert"]')).toHaveCount(0);
  await expect(page.locator('main')).not.toContainText('ChatGPT');
  await expect(
    page.getByRole('button', { name: /^Open clue notebook/ }),
  ).toHaveCount(0);
  await expect(page.locator('.story-clues-sheet')).toHaveCount(0);

  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.evaluate(() => {
    document.documentElement.style.zoom = '2';
  });
  await expect(availability).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);

  const violations = await new AxeBuilder({ page }).analyze();
  expect(violations.violations).toEqual([]);
});

test('copies the temporary Chrome flag without a relaunch prompt', async ({
  context,
  page,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin: 'http://localhost:3000',
  });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'userAgentData', {
      configurable: true,
      value: {
        brands: [
          { brand: 'Chromium', version: '152' },
          { brand: 'Google Chrome', version: '152' },
        ],
        mobile: false,
      },
    });
  });
  await page.goto(EXPERIENCE_PATH);

  const availability = page.locator('[data-webmcp-availability]');
  await expect(availability.locator('code')).toHaveText(
    'chrome://flags/#enable-webmcp-testing',
  );
  await expect(availability).toContainText('Enable the Chrome flag:');
  await expect(availability).not.toContainText('Check again');
  await expect(availability).not.toContainText('relaunch');
  await page.getByRole('button', { name: 'Copy Chrome flag' }).click();
  await expect(
    page.getByRole('button', { name: 'Chrome flag copied' }),
  ).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe('chrome://flags/#enable-webmcp-testing');
});

test('keeps a blocked WebMCP registration short and non-actionable', async ({
  page,
}) => {
  await installModelContextMock(page, {
    dispatchToolChange: true,
    globalName: '__webMCPTools',
    initialFailure: 'permission',
    registrationBudget: 6,
  });
  await page.goto(EXPERIENCE_PATH);

  const availability = page.locator('[data-webmcp-availability]');
  await expect(
    availability.getByRole('heading', { name: 'Access restricted' }),
  ).toBeVisible();
  await expect(availability).toContainText(
    'Page tools are blocked for this site.',
  );
  await expect(availability).not.toContainText('WebMCP');
  await expect(availability.getByRole('button')).toHaveCount(0);
});

test('recovers from an initial WebMCP startup error', async ({ page }) => {
  await installModelContextMock(page, {
    dispatchToolChange: true,
    globalName: '__webMCPTools',
    initialFailure: 'error',
    registrationBudget: 6,
  });
  await page.goto(EXPERIENCE_PATH);

  await expect(
    page.getByRole('heading', { name: 'Access interrupted' }),
  ).toBeVisible();
  await expect(page.locator('#your-turn, .writing-marker')).toHaveCount(0);
  await page.getByRole('button', { name: 'Try again' }).click();

  await waitForTool(page, 'get_story_state');
  await expect(page.locator('[data-webmcp-availability]')).toHaveCount(0);
  await expect(page.locator('.sheet-pager')).not.toHaveAttribute('inert', '');
  await expect(
    page.getByRole('heading', { name: 'The speaker is waiting.' }),
  ).toBeVisible();
  await expect(page.locator('.sr-live')).toHaveText(
    'Your agent can now read and write this record.',
  );
  await expect(page.locator('.agent-presence')).toHaveAttribute(
    'data-presence',
    'waiting',
  );
  await expect(page.locator('#your-turn')).toHaveCount(1);
  await expect(page.locator('.sheet-page-indicator')).toContainText('Sheet 01');
  expect(await page.evaluate(() => window.__webMCPRegistrationHistory)).toEqual(
    ['get_story_state', 'begin_story_turn', 'commit_story_chapter'],
  );
});
