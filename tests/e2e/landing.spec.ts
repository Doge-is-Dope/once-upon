import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('landing is usable at desktop and phone widths', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Can you fool ChatGPT/i })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start a game' })).toBeVisible();
  await page.setViewportSize({ width: 320, height: 700 });
  await expect(page.getByRole('button', { name: 'Quick demo' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  const buttonHeights = await page.getByRole('button').evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().height));
  expect(buttonHeights.every((height) => height >= 48)).toBe(true);
});

test('complete explainer fits a 16:9 first viewport without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Can you fool ChatGPT/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Fool the Detective' })).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Quick demo' })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1280);
  const explainerBottom = await page.locator('.how-it-works').evaluate((element) => element.getBoundingClientRect().bottom);
  expect(explainerBottom).toBeLessThanOrEqual(720);
});

test('reduced-motion preference disables decorative animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const motion = await page.getByRole('button', { name: 'Start a game' }).evaluate((element) => {
    const style = getComputedStyle(element);
    return { animation: style.animationName, transition: style.transitionDuration };
  });
  expect(motion.animation).toBe('none');
  expect(Number.parseFloat(motion.transition) || 0).toBeLessThanOrEqual(0.00001);
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
