import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import {
  callTool,
  installModelContextMock,
  waitForTool,
} from './support/webmcp-mock';

const EXPERIENCE_PATH = '/experiences/the-last-manuscript';

test('shows only the outer restriction screen on mobile', async ({ page }) => {
  await installModelContextMock(page, {
    dispatchToolChange: true,
    globalName: '__webMCPTools',
    registrationBudget: 6,
  });
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto(EXPERIENCE_PATH);

  const restriction = page.locator('[data-support-restricted]');
  await expect(restriction).toHaveCount(1);
  await expect(
    page.getByRole('heading', {
      name: 'Access restricted',
    }),
  ).toBeVisible();
  await expect(restriction).toContainText(
    'Open this record on a larger desktop screen to continue.',
  );
  await expect(
    page.locator(
      '.frame-book, .sheet-pager, [data-webmcp-availability], button, a, input, textarea, select, [tabindex]',
    ),
  ).toHaveCount(0);
  expect(await page.evaluate(() => window.__webMCPRegistrationHistory)).toEqual(
    [],
  );

  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.evaluate(() => {
    document.documentElement.style.zoom = '2';
  });
  await expect(restriction).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);

  const violations = await new AxeBuilder({ page }).analyze();
  expect(violations.violations).toEqual([]);
});

test('keeps the server restriction screen usable without JavaScript', async ({
  browser,
}) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 1280, height: 720 },
  });
  const page = await context.newPage();
  await page.goto(EXPERIENCE_PATH);

  await expect(
    page.getByRole('heading', { name: 'Access restricted' }),
  ).toBeVisible();
  await expect(page.locator('[data-support-restricted]')).toContainText(
    'Open this record on a larger desktop screen to continue.',
  );
  await expect(
    page.locator('button, a, input, textarea, select, [tabindex]'),
  ).toHaveCount(0);
  await context.close();
});

test('uses 640px as the inclusive support boundary', async ({ page }) => {
  await installModelContextMock(page, {
    dispatchToolChange: true,
    globalName: '__webMCPTools',
    registrationBudget: 6,
  });
  await page.setViewportSize({ width: 640, height: 800 });
  await page.goto(EXPERIENCE_PATH);
  await expect(page.locator('[data-support-restricted]')).toBeVisible();
  expect(await page.evaluate(() => window.__webMCPRegistrationHistory)).toEqual(
    [],
  );

  await page.setViewportSize({ width: 641, height: 800 });
  await waitForTool(page, 'get_story_state');
  await expect(page.locator('[data-support-restricted]')).toHaveCount(0);
  await expect(page.locator('.frame-book')).toBeVisible();
});

test('mobile UA remains restricted on a wide viewport', async ({ page }) => {
  await installModelContextMock(page, {
    dispatchToolChange: true,
    globalName: '__webMCPTools',
    registrationBudget: 6,
  });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'userAgentData', {
      configurable: true,
      value: { brands: [], mobile: true },
    });
  });
  await page.setViewportSize({ width: 1024, height: 720 });
  await page.goto(EXPERIENCE_PATH);
  await expect(page.locator('[data-support-restricted]')).toBeVisible();
  expect(await page.evaluate(() => window.__webMCPRegistrationHistory)).toEqual(
    [],
  );
});

test('unregisters while narrow and restores the same session', async ({
  page,
}) => {
  await installModelContextMock(page, {
    dispatchToolChange: true,
    globalName: '__webMCPTools',
    registrationBudget: 9,
  });
  await page.setViewportSize({ width: 800, height: 720 });
  await page.goto(EXPERIENCE_PATH);
  await waitForTool(page, 'get_story_state');
  const before = await callTool<{
    structuredContent: { state: { sessionId: string } };
  }>(page, 'get_story_state', {});

  await page.setViewportSize({ width: 640, height: 720 });
  await expect(page.locator('[data-support-restricted]')).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.__webMCPTools.size))
    .toBe(0);
  await expect
    .poll(() => page.evaluate(() => window.__webMCPAbortHistory.length))
    .toBe(3);

  await page.setViewportSize({ width: 800, height: 720 });
  await waitForTool(page, 'get_story_state');
  const after = await callTool<{
    structuredContent: { state: { sessionId: string } };
  }>(page, 'get_story_state', {});
  expect(after.structuredContent.state.sessionId).toBe(
    before.structuredContent.state.sessionId,
  );
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
  await expect(page.locator('#your-turn')).toHaveCount(1);
  await expect(page.locator('.sheet-page-indicator')).toContainText('Page 1');
  expect(await page.evaluate(() => window.__webMCPRegistrationHistory)).toEqual(
    ['get_story_state', 'begin_story_turn', 'commit_story_chapter'],
  );
});
