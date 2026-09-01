import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { installModelContextMock } from './support/webmcp-mock';

const EXPERIENCE_PATH = '/experiences/the-last-manuscript';
const WEBMCP_SPEC_URL = 'https://webmachinelearning.github.io/webmcp/';

test('shows one accessible explanation when WebMCP is unavailable', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto(EXPERIENCE_PATH);

  const availability = page.locator('[data-webmcp-availability]');
  await expect(availability).toHaveCount(1);
  await expect(
    page.getByRole('heading', {
      name: "WebMCP isn't available for this page",
    }),
  ).toBeVisible();
  await expect(availability).toContainText(
    'WebMCP lets your agent interact with this story through tools exposed by the page.',
  );
  const learnLink = page.getByRole('link', { name: 'Learn about WebMCP' });
  await expect(learnLink).toHaveAttribute('href', WEBMCP_SPEC_URL);
  await learnLink.focus();
  await expect(learnLink).toBeFocused();

  await expect(page.getByText('Your turn')).toHaveCount(0);
  await expect(page.getByText('Need a hint?')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Hint', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Copy example message' }),
  ).toHaveCount(0);
  await expect(page.locator('.story-presence')).toHaveCount(0);
  await expect(page.locator('[role="alert"]')).toHaveCount(0);
  await expect(page.locator('main')).not.toContainText('ChatGPT');

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

for (const scenario of [
  {
    failure: 'permission' as const,
    heading: 'WebMCP is blocked for this page',
    action: 'Check again',
  },
  {
    failure: 'error' as const,
    heading: 'WebMCP couldn’t start',
    action: 'Try again',
  },
]) {
  test(`recovers from an initial ${scenario.failure} registration failure`, async ({
    page,
  }) => {
    await installModelContextMock(page, {
      dispatchToolChange: true,
      globalName: '__webMCPTools',
      initialFailure: scenario.failure,
      registrationBudget: 6,
    });
    await page.goto(EXPERIENCE_PATH);

    await expect(
      page.getByRole('heading', { name: scenario.heading }),
    ).toBeVisible();
    await expect(page.getByText('Your turn')).toHaveCount(0);
    await page.getByRole('button', { name: scenario.action }).click();

    await waitForTool(page, 'get_story_state');
    await expect(page.locator('[data-webmcp-availability]')).toHaveCount(0);
    await expect(
      page.getByRole('heading', { name: 'The speaker is waiting.' }),
    ).toBeVisible();
    await expect(page.locator('.sr-live')).toHaveText(
      'Agent tools are ready. You can continue in one message.',
    );
    // Recovery swaps the notice for the turn guide in place; the pager
    // must not be yanked to another page by the status change.
    await expect(page.locator('#your-turn')).toHaveCount(1);
    expect(
      await page.evaluate(() => window.__webMCPRegistrationHistory),
    ).toEqual(['get_story_state', 'begin_story_turn', 'commit_story_chapter']);
  });
}

async function waitForTool(page: Page, name: string): Promise<void> {
  await expect
    .poll(() => page.evaluate((tool) => window.__webMCPTools.has(tool), name))
    .toBe(true);
}
