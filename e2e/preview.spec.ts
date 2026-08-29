import { expect, test } from '@playwright/test';

test('shows an honest page-turning preview without a fake chat', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 760 });
  await page.goto('/');

  await expect(
    page.getByRole('button', { name: 'Copy link and message' }),
  ).toBeVisible();
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
