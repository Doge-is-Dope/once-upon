import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { callTool, installModelContextMock } from './support/webmcp-mock';

test.beforeEach(async ({ page }) => {
  await installModelContextMock(page, {
    globalName: '__webMCPTools',
    dispatchToolChange: true,
    respectOptOut: true,
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Start' })).toBeVisible();
});

test('walks a new player from the how-to card to concrete first moves', async ({
  context,
  page,
}) => {
  await context.grantPermissions(['clipboard-write']);
  await page.getByLabel("Your character's name").fill('Mara');
  await page.getByRole('button', { name: 'Start' }).click();

  // State 1: the how-to card explains the loop in three steps.
  await expect(page.getByText('How this book works')).toBeVisible();
  const steps = page.locator('.how-to-steps li');
  await expect(steps).toHaveCount(3);
  await expect(steps.nth(0)).toContainText('You say what you try');
  await expect(steps.nth(2)).toContainText(
    'Every action fills one of the six pages.',
  );
  const howToScan = await new AxeBuilder({ page }).analyze();
  expect(howToScan.violations).toEqual([]);

  // State 2: copying the opening message flips to the waiting state.
  await page
    .getByRole('button', { name: 'Copy the opening message' })
    .click();
  await expect(
    page.getByText('Waiting for your AI to open the book…'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Copy it again' })).toBeVisible();

  // State 3: the agent's first tool call hands the player concrete options.
  await callTool(page, 'get_story_state', {});
  await expect(page.getByText('Your AI has opened the book')).toBeVisible();
  const prologueMoves = page.locator('.next-moves').first();
  await expect(prologueMoves.getByText('Search the common-room hearth')).toBeVisible();
  await expect(
    prologueMoves.getByRole('button', { name: 'Copy' }).first(),
  ).toBeVisible();

  // Rolling shows the outcome first; the math is a footnote.
  const rolled = await callTool<{
    structuredContent: {
      resolution: { resolutionId: string; representedEventIds: string[] };
      state: { revision: number };
    };
  }>(page, 'perform_action', {
    operationId: 'e2e_onboarding_roll',
    expectedRevision: 1,
    targetId: 'search_hearth',
    approach: 'wits',
    intent: 'I search the dying hearth.',
  });
  const draftRoll = page.locator('[data-leaf-kind="draft"] .roll-card').first();
  await expect(draftRoll.locator('strong')).toHaveText(
    /Critical success|Success at a cost|Success|Setback|Critical setback/,
  );
  await expect(draftRoll.locator('.roll-math')).toContainText('Wits');
  await expect(
    page.getByLabel('Adventure status').getByText('I of VI'),
  ).toBeVisible();

  // Committing the page brings back the turn prompt, options, and countdown.
  await callTool(page, 'commit_narration', {
    operationId: 'e2e_onboarding_write',
    expectedRevision: rolled.structuredContent.state.revision,
    resolutionId: rolled.structuredContent.resolution.resolutionId,
    representedEventIds:
      rolled.structuredContent.resolution.representedEventIds,
    payload: {
      format: 'prose',
      text: 'Mara searched beneath the dying hearth and closed her hand around the warm Charred Key, exactly as the saved roll recorded, while the raven kept its patient watch from the rafters above her.',
    },
  });
  await expect(page.getByText('Your turn', { exact: true }).first()).toBeVisible();
  await expect(
    page.getByText('5 pages remain in this manuscript.').first(),
  ).toBeVisible();
  const nextMoves = page.locator('.next-moves').first();
  await expect(
    nextMoves.getByText('Offer the Charred Key to the raven'),
  ).toBeVisible();

  // Mechanic jargon stays hidden from the status strip.
  const statusStrip = page.getByLabel('Adventure status');
  await expect(statusStrip).not.toContainText('Clock');
  await expect(statusStrip).not.toContainText('Resolve');

  // The options panel links into the full ledger.
  await nextMoves
    .getByRole('button', { name: 'All options are in the ledger' })
    .click();
  const ledger = page.getByRole('dialog', { name: 'Adventure ledger' });
  await expect(ledger).toBeVisible();
  await expect(ledger.getByText('Page I of VI')).toBeVisible();
  await expect(ledger.getByText('The story ends when the book is full.')).toBeVisible();
  await page.keyboard.press('Escape');

  const playingScan = await new AxeBuilder({ page }).analyze();
  expect(playingScan.violations).toEqual([]);
});
