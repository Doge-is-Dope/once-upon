import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('landing is usable at desktop and phone widths', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Can ChatGPT tell/i })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create a room' })).toBeVisible();
  await page.setViewportSize({ width: 320, height: 700 });
  await expect(page.getByRole('button', { name: 'Try Demo Room' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
});

test('landing is keyboard navigable and has no detectable axe violations', async ({ page }, testInfo) => {
  await page.goto('/');
  if (testInfo.project.name === 'host') {
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Can You Be Me? home' })).toBeFocused();
  }
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
