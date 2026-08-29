import { expect, test } from '@playwright/test';

test('shows an honest page-turning preview without a fake chat', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 760 });
  await page.goto('/');

  const startButton = page.getByRole('button', { name: 'Start' });
  await expect(startButton).toBeVisible();
  await expect(page.getByText('Once Upon presents')).toBeVisible();
  await expect(startButton).toBeDisabled();
  await expect(
    page.getByText("WebMCP isn't available in this browser."),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Copy game link' }),
  ).toHaveCount(0);
  await expect(startButton).toHaveAttribute('aria-describedby');
  const tooltip = page.getByText("WebMCP isn't available in this browser.");
  const [tooltipBox, buttonBox] = await Promise.all([
    tooltip.boundingBox(),
    startButton.boundingBox(),
  ]);
  expect(tooltipBox).not.toBeNull();
  expect(buttonBox).not.toBeNull();
  expect(tooltipBox!.y + tooltipBox!.height).toBeLessThan(buttonBox!.y);
  await expect(page.getByLabel('Chrome WebMCP flag URL')).toHaveCount(0);
  await expect(page.getByRole('textbox')).toHaveCount(0);

  await expect(page.getByText('Sample leaves')).toBeVisible();
  await expect(page.getByText('This manuscript belongs to')).toBeVisible();
  await page.getByRole('button', { name: 'Next sample pages' }).click();
  await expect(page.getByText('A key in the ashes')).toBeVisible();
  await expect(page.getByText('Charred Key', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Next sample pages' }),
  ).toBeDisabled();

  const overflows = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
  expect(overflows).toBe(false);
});
