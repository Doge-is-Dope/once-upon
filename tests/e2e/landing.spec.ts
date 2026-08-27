import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('unsupported browsers show a disabled start with a short accessible explanation', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    Object.defineProperty(document, 'modelContext', { configurable: true, value: undefined });
  });
  await page.goto('/');
  const start = page.getByRole('button', { name: 'Start a game' });
  const trigger = page.getByRole('group', { name: 'Start a game' });
  const hint = page.getByRole('dialog', { includeHidden: true });
  await expect(start).toBeDisabled();
  await expect(hint).toBeHidden();
  await expect(hint).toHaveText('This browser doesn’t support WebMCP');
  await expect(start).toHaveAccessibleDescription('This browser doesn’t support WebMCP');
  await expect(page.getByRole('alert')).toHaveCount(0);
  const initialStartBox = await start.boundingBox();
  if (testInfo.project.name === 'host') await trigger.hover();
  else await trigger.tap();
  await expect(hint).toBeVisible();
  const docs = hint.getByRole('link', { name: 'WebMCP', exact: true });
  await expect(docs).toHaveAttribute('href', 'https://developer.chrome.com/docs/ai/webmcp');
  await expect(docs).toHaveAttribute('target', '_blank');
  await expect(docs).toHaveCSS('text-decoration-style', 'dashed');
  expect(await start.boundingBox()).toEqual(initialStartBox);
  const style = await start.evaluate((element) => {
    const css = getComputedStyle(element);
    return { background: css.backgroundColor, shadow: css.boxShadow, transform: css.transform };
  });
  expect(style).toEqual({ background: 'rgb(222, 222, 217)', shadow: 'none', transform: 'none' });
  await expect(hint).toHaveCSS('border-radius', '10px');
  await expect(hint).toHaveCSS('background-color', 'rgb(23, 35, 25)');
  await expect(hint).toHaveCSS('color', 'rgb(255, 255, 255)');
  const startBox = await start.boundingBox();
  const hintBox = await hint.boundingBox();
  expect(hintBox!.y + hintBox!.height).toBeLessThanOrEqual(startBox!.y);
  expect(startBox!.y - hintBox!.y - hintBox!.height).toBeCloseTo(8, 0);
  const expectedCenter = Math.max(16 + hintBox!.width / 2, Math.min(startBox!.x + startBox!.width / 2, page.viewportSize()!.width - 16 - hintBox!.width / 2));
  expect(hintBox!.x + hintBox!.width / 2).toBeCloseTo(expectedCenter, 0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
  if (testInfo.project.name === 'host') {
    await hint.hover();
    await expect(hint).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(hint).toBeHidden();
    await page.getByRole('heading', { level: 1 }).hover();
    await page.getByRole('link', { name: 'Can You Be Me? home' }).focus();
    await page.keyboard.press('Tab');
    await expect(trigger).toBeFocused();
    await expect(hint).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(docs).toBeFocused();
    await expect(hint).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(hint).toBeHidden();
    await expect(trigger).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Show step 1: Start with honest answers' })).toBeFocused();
    await page.keyboard.press('Enter');
  } else {
    await page.getByRole('button', { name: 'Show step 1: Start with honest answers' }).tap();
  }
  await expect(page.getByRole('heading', { name: 'Start with honest answers' })).toBeVisible();
  await expect(hint).toBeHidden();
  if (testInfo.project.name === 'host') await trigger.hover();
  else await trigger.tap();
  await expect(hint).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('unsupported-landing.png'), fullPage: true });
  await page.setViewportSize({ width: 320, height: 700 });
  if (testInfo.project.name === 'host') { await page.getByRole('heading', { level: 1 }).hover(); await trigger.hover(); }
  else await trigger.tap();
  await expect(hint).toBeVisible();
  expect(await hint.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  const narrowHintBox = await hint.boundingBox();
  expect(narrowHintBox!.x).toBeGreaterThanOrEqual(0);
  expect(narrowHintBox!.x + narrowHintBox!.width).toBeLessThanOrEqual(320);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
});

test('desktop Chrome 149+ explains how to enable WebMCP inside the existing tooltip', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'host', 'The setup path is only for desktop Chrome.');
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'userAgentData', {
      configurable: true,
      value: { brands: [{ brand: 'Google Chrome', version: '149' }], mobile: false },
    });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (value: string) => {
        document.documentElement.dataset.copiedSetupAddress = value;
        document.documentElement.dataset.copySetupCount = String(Number(document.documentElement.dataset.copySetupCount ?? 0) + 1);
      } },
    });
    Object.defineProperty(document, 'modelContext', { configurable: true, value: undefined });
  });
  await page.goto('/');

  const start = page.getByRole('button', { name: 'Start a game' });
  const trigger = page.getByRole('group', { name: 'Start a game' });
  const hint = page.locator('[role="dialog"][aria-label="WebMCP setup"]');
  await expect(start).toBeDisabled();
  await expect(start).toHaveAccessibleDescription(/WebMCP isn’t enabled/);
  await expect(hint).toContainText('Paste this into Chrome’s address bar, then set WebMCP Testing to Enabled.');
  await expect(hint).not.toContainText('Learn more');
  await expect(hint).toBeHidden();
  await page.getByRole('link', { name: 'Can You Be Me? home' }).focus();
  await page.keyboard.press('Tab');
  await expect(trigger).toBeFocused();
  await expect(hint).toBeVisible();

  await page.keyboard.press('Tab');
  const docs = hint.getByRole('link', { name: 'WebMCP' });
  await expect(docs).toBeFocused();
  await expect(docs).toHaveAttribute('href', 'https://developer.chrome.com/docs/ai/webmcp');
  await page.keyboard.press('Tab');
  const copy = hint.locator('.webmcp-copy-button');
  await expect(copy).toBeFocused();
  await expect(copy).toHaveAccessibleName('Copy Chrome setting');
  await page.keyboard.press('Enter');
  await expect(copy).toHaveAttribute('data-copied', 'true');
  await expect(copy).toHaveAttribute('data-celebrating', 'true');
  await expect(copy).toBeDisabled();
  await expect(copy).toHaveAccessibleName('Chrome setting copied');
  await expect(copy.locator('[data-icon="check"]')).toHaveCSS('opacity', '1');
  await expect(copy.locator('.webmcp-copy-confetti i')).toHaveCount(8);
  await expect(copy.locator('.webmcp-copy-status')).toHaveText('Chrome setting copied.');
  await expect(copy.getByText('Copied', { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.dataset.copiedSetupAddress)).toBe('chrome://flags/#enable-webmcp-testing');
  expect(await page.evaluate(() => document.documentElement.dataset.copySetupCount)).toBe('1');
  await page.keyboard.press('Enter');
  expect(await page.evaluate(() => document.documentElement.dataset.copySetupCount)).toBe('1');
  await expect(copy).toHaveAttribute('data-celebrating', 'false', { timeout: 1_200 });
  await expect(copy.locator('.webmcp-copy-confetti')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(hint).toBeHidden();
  await trigger.hover();
  await expect(hint).toBeVisible();
  await page.getByRole('heading', { level: 1 }).hover();
  await expect(hint).toBeHidden();
  await trigger.hover();
  await expect(hint).toBeVisible();
  await expect(copy).toHaveAttribute('data-copied', 'true');
  await expect(copy).toHaveAttribute('data-celebrating', 'false');
  await expect(copy.locator('.webmcp-copy-confetti')).toHaveCount(0);
  await expect(copy.locator('.webmcp-success-motion')).toHaveCSS('animation-name', 'none');
  await expect(hint).toContainText('chrome://flags/#enable-webmcp-testing');
  expect(await hint.locator('code').evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    return range.getClientRects().length;
  })).toBe(1);
  await expect(hint.locator('a[href^="chrome://"]')).toHaveCount(0);
  await expect(copy).toHaveAccessibleName('Copy Chrome setting', { timeout: 4_000 });
  await expect(copy).toHaveAttribute('data-copied', 'false');
  await expect(copy).toBeEnabled();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await copy.press('Enter');
  await expect(copy).toHaveAccessibleName('Chrome setting copied');
  await expect(copy.locator('[data-icon="check"]')).toHaveCSS('opacity', '1');
  await expect(copy.locator('.webmcp-success-motion')).toHaveCSS('animation-name', 'none');
  await expect(copy.locator('.webmcp-copy-confetti')).toBeHidden();

  await page.setViewportSize({ width: 320, height: 700 });
  await expect(hint).toBeHidden();
  await trigger.focus();
  await expect(hint).toBeVisible();
  expect(await hint.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  const box = await hint.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(320);
  await page.keyboard.press('Escape');
  await expect(hint).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('WebMCP help opens the official documentation without leaving the game', async ({ page, context }, testInfo) => {
  const officialDocs = 'https://developer.chrome.com/docs/ai/webmcp';
  // Keep navigation deterministic; the destination itself is verified separately.
  await context.route(officialDocs, (route) => route.fulfill({ contentType: 'text/html', body: '<h1>WebMCP documentation</h1>' }));
  await page.addInitScript(() => {
    Object.defineProperty(document, 'modelContext', { configurable: true, value: undefined });
  });
  await page.goto('/');
  const trigger = page.getByRole('group', { name: 'Start a game' });
  const docs = page.getByRole('link', { name: 'WebMCP', exact: true });
  const actions = testInfo.project.name === 'host' ? ['pointer', 'keyboard'] : ['touch'];
  for (const action of actions) {
    if (action === 'keyboard') {
      await page.getByRole('heading', { level: 1 }).hover();
      await page.getByRole('link', { name: 'Can You Be Me? home' }).focus();
      await page.keyboard.press('Tab');
      await expect(trigger).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(docs).toBeFocused();
    } else if (action === 'touch') await trigger.tap();
    else { await trigger.hover(); await docs.hover(); }
    const popupPromise = page.waitForEvent('popup');
    if (action === 'keyboard') await page.keyboard.press('Enter');
    else if (action === 'touch') await docs.tap();
    else await docs.click();
    const popup = await popupPromise;
    await expect(popup).toHaveURL(officialDocs);
    await popup.close();
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('button', { name: 'Start a game' })).toBeDisabled();
    await page.keyboard.press('Escape');
  }
});

test('capable browsers can start at any screen size and recheck support on focus', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    Object.defineProperty(document, 'modelContext', { configurable: true, value: { registerTool: async () => {} } });
  });
  await page.goto('/');
  const start = page.getByRole('button', { name: 'Start a game' });
  await expect(start).toBeEnabled();
  await expect(page.locator('.tooltip-content')).toHaveCount(0);
  await expect(start).not.toHaveAttribute('aria-describedby');
  if (testInfo.project.name === 'host') {
    await page.getByRole('link', { name: 'Can You Be Me? home' }).focus();
    await page.keyboard.press('Tab');
    await expect(start).toBeFocused();
  }
  await page.evaluate(() => {
    Object.defineProperty(document, 'modelContext', { configurable: true, value: undefined });
    window.dispatchEvent(new Event('focus'));
  });
  await expect(start).toBeDisabled();
  await expect(page.getByRole('dialog', { includeHidden: true })).toHaveText('This browser doesn’t support WebMCP');
});

test('landing is usable at desktop and phone widths', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Can you fool the AI Detective/i })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start a game' })).toBeVisible();
  await expect(page.locator('footer')).toHaveText('Built for the WebMCP Challenge');
  await page.setViewportSize({ width: 320, height: 700 });
  await expect(page.getByRole('button', { name: 'Quick demo' })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  const buttonHeights = await page.getByRole('button').evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().height));
  expect(buttonHeights.every((height) => height >= 48)).toBe(true);
});

test('learn example keeps the question and round label on one spacious row', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const scene = page.locator('.tutorial-scene-1');
  await expect(scene.locator('.learn-label strong')).toHaveText('What would you order?');
  await expect(scene.getByText('Pizza', { exact: true })).toBeVisible();
  await expect(scene.getByText('Sushi', { exact: true })).toBeVisible();
  await expect(scene.locator('.learn-phone small')).toHaveCount(0);
  for (const width of [320, 390, 636, 780, 781, 820, 1280]) {
    await page.setViewportSize({ width, height: 789 });
    const layout = await scene.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const label = element.querySelector('.learn-label')!.getBoundingClientRect();
      const badge = element.querySelector('.learn-label span')!.getBoundingClientRect();
      const question = element.querySelector('.learn-label strong')!.getBoundingClientRect();
      const cards = Array.from(element.querySelectorAll('.learn-phone'), (card) => card.getBoundingClientRect());
      return {
        centerDifference: Math.abs(badge.y + badge.height / 2 - question.y - question.height / 2),
        gap: question.left - badge.right,
        leftSpace: label.left - bounds.left,
        rightSpace: bounds.right - label.right,
        cardGap: Math.min(...cards.map((card) => card.top)) - label.bottom,
      };
    });
    expect(layout.centerDifference).toBeLessThan(1);
    expect(layout.gap).toBeGreaterThanOrEqual(8);
    expect(layout.leftSpace).toBeGreaterThanOrEqual(8);
    expect(layout.rightSpace).toBeGreaterThanOrEqual(8);
    expect(layout.cardGap).toBeGreaterThanOrEqual(8);
    const cardText = await scene.locator('.learn-phone').evaluateAll((cards) => cards.map((card) => {
      const icon = card.querySelector('span')!;
      const answer = card.querySelector('strong')!;
      const style = getComputedStyle(answer);
      const top = Math.min(icon.offsetTop, answer.offsetTop);
      const bottom = Math.max(icon.offsetTop + icon.offsetHeight, answer.offsetTop + answer.offsetHeight);
      return {
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        sameFontAsBody: style.fontFamily === getComputedStyle(document.body).fontFamily,
        textTransform: style.textTransform,
        centerDifference: Math.abs((top + bottom) / 2 - card.clientHeight / 2),
        contentGap: Math.max(answer.offsetLeft - icon.offsetLeft - icon.offsetWidth, answer.offsetTop - icon.offsetTop - icon.offsetHeight),
        fits: answer.scrollWidth <= answer.clientWidth,
      };
    }));
    for (const text of cardText) {
      expect(text).toMatchObject({
        fontSize: '18px', fontWeight: '700', sameFontAsBody: true,
        textTransform: 'none', fits: true,
      });
      expect(text.centerDifference).toBeLessThanOrEqual(1);
      expect(text.contentGap).toBeGreaterThanOrEqual(8);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    if ([320, 636, 1280].includes(width)) {
      await scene.screenshot({ path: testInfo.outputPath(`learn-example-${width}.png`) });
    }
  }
});

test('tutorial cards keep readable consistent type and unobscured text across steps', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    Object.defineProperty(document, 'modelContext', { configurable: true, value: { registerTool: async () => {} } });
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Start a game' })).toBeEnabled();
  const steps = page.getByRole('list', { name: 'Game rules' }).getByRole('button');
  for (const width of [320, 390, 520, 521, 636, 781, 1280]) {
    await page.setViewportSize({ width, height: 789 });
    const compositions = new Set<string>();
    let firstQuestionStyle: unknown;
    for (const step of [0, 1, 2, 3, 4]) {
      await steps.nth(step).click();
      const scene = page.locator(`.tutorial-scene-${step + 1}`);
      await scene.scrollIntoViewIfNeeded();
      const layout = await scene.evaluate((element) => {
        const scene = element.getBoundingClientRect();
        const header = element.querySelector('.tutorial-scene-header')?.getBoundingClientRect();
        const body = element.querySelector('.tutorial-scene-body')!.getBoundingClientRect();
        const top = header?.top ?? body.top;
        const cards = Array.from(element.querySelectorAll<HTMLElement>('.tutorial-card'));
        const boxes = cards.map((card) => card.getBoundingClientRect());
        return {
          centered: Math.abs((top + body.bottom) / 2 - (scene.top + scene.bottom) / 2),
          topSpace: top - scene.top,
          bottomSpace: scene.bottom - body.bottom,
          composition: `${cards[0].offsetWidth}:${cards[0].offsetHeight}:${getComputedStyle(cards[0]).borderRadius}`,
          headerGap: header ? Math.round((Math.min(...boxes.map((box) => box.top)) - header.bottom) * 100) / 100 : null,
          visibleGap: Math.max(boxes[1].left - boxes[0].right, boxes[1].top - boxes[0].bottom),
        };
      });
      compositions.add(layout.composition);
      expect(layout.centered, `${width}px step ${step + 1}: vertically centered composition`).toBeLessThan(1);
      expect(layout.topSpace).toBeGreaterThanOrEqual(12);
      expect(layout.bottomSpace).toBeGreaterThanOrEqual(12);
      if (step === 3) {
        expect(layout.headerGap).toBeNull();
        await expect(scene.locator('.tutorial-scene-header')).toHaveCount(0);
      } else {
        expect(layout.headerGap).toBeGreaterThanOrEqual(8);
      }
      expect(layout.visibleGap, `${width}px step ${step + 1}: space between cards`).toBeGreaterThanOrEqual(6);
      if (step <= 2) {
        await expect(scene.locator('.tutorial-round-badge')).toHaveText(['Learn', 'Secret roles', 'Challenge'][step]);
        await expect(scene.locator('.tutorial-round-badge')).toHaveCSS('text-transform', 'uppercase');
        await expect(scene.locator('.tutorial-round-badge')).toHaveCSS('font-size', '12px');
        await expect(scene.locator('.tutorial-round-badge')).toHaveCSS('font-weight', '600');
        expect(await scene.locator('.tutorial-round-badge').evaluate((element) => getComputedStyle(element).fontFamily === getComputedStyle(document.body).fontFamily)).toBe(true);
      }
      if (step === 0 || step === 2) {
        const style = await scene.locator('.tutorial-question').evaluate((element) => {
          const badge = element.querySelector('span')!;
          const question = element.querySelector('strong')!;
          const css = getComputedStyle(badge);
          const title = getComputedStyle(question);
          const first = badge.getBoundingClientRect();
          const second = question.getBoundingClientRect();
          return {
            badge: { font: css.font, color: css.color, background: css.backgroundColor, padding: css.padding, radius: css.borderRadius, spacing: css.letterSpacing, casing: css.textTransform },
            title: { font: title.font, color: title.color },
            gap: getComputedStyle(element).gap,
            centerDifference: Math.abs(first.y + first.height / 2 - second.y - second.height / 2),
          };
        });
        if (step === 0) firstQuestionStyle = style;
        expect(style).toEqual(firstQuestionStyle);
        expect(style.centerDifference).toBeLessThan(1);
      }
      if (step === 1) {
        await expect(scene.locator('.mirror small')).toHaveText('Answer like the Original');
        const gaps = await scene.locator('.role-card').evaluateAll((cards) => cards.map((card) => {
          const label = card.querySelector('small')!;
          const icon = card.querySelector('span')!;
          return icon.offsetTop - label.offsetTop - label.offsetHeight;
        }));
        for (const gap of gaps) {
          expect(gap).toBeGreaterThanOrEqual(5);
          expect(gap).toBeLessThanOrEqual(7);
        }
      }
      if (step === 3) {
        await expect(scene.locator('.objection-token strong')).toHaveText('Objection!');
        await expect(scene.locator('.objection-token .tutorial-corner-emoji')).toHaveText('✋');
        await expect(scene.locator('.follow-up-card .tutorial-corner-emoji')).toHaveText('🤖');
        await expect(scene.locator('.follow-up-card')).toHaveCSS('box-shadow', 'none');
        await expect(scene.locator('.follow-up-card')).toHaveCSS('border-style', 'dashed');
        const decorations = await scene.locator('.tutorial-corner-emoji').evaluateAll((icons) => icons.map((element) => {
          const icon = element as HTMLElement;
          const box = icon.getBoundingClientRect();
          const scene = icon.closest('.tutorial-scene')!.getBoundingClientRect();
          const card = icon.parentElement!;
          const text = Array.from(card.querySelectorAll('small, strong'), (item) => item.getBoundingClientRect());
          const iconStyle = getComputedStyle(icon);
          const textStyle = getComputedStyle(card.querySelector('strong')!);
          return {
            fits: box.left >= scene.left && box.right <= scene.right && box.top >= scene.top && box.bottom <= scene.bottom,
            clearOfText: text.every((item) => box.bottom <= item.top || box.top >= item.bottom || box.right <= item.left || box.left >= item.right),
            enlarged: iconStyle.fontSize === '36px',
            atTop: icon.offsetTop <= 0,
            correctCorner: card.matches('.objection-token')
              ? icon.offsetLeft + icon.offsetWidth <= card.clientWidth / 2
              : icon.offsetLeft >= card.clientWidth / 2,
            matchesTextAngle: iconStyle.transform === textStyle.transform && iconStyle.rotate === textStyle.rotate,
          };
        }));
        for (const decoration of decorations) expect(decoration).toEqual({ fits: true, clearOfText: true, enlarged: true, atTop: true, correctCorner: true, matchesTextAngle: true });
      }
      if (step === 4) {
        const outcomes = await scene.locator('.outcome-card').evaluateAll((cards) => cards.map((card) => {
          const caption = card.querySelector('small')!;
          const result = card.querySelector('strong')!;
          return {
            horizontalCenter: Math.max(...[caption, result].map((text) => Math.abs(text.offsetLeft + text.offsetWidth / 2 - card.clientWidth / 2))),
            verticalCenter: Math.abs((caption.offsetTop + result.offsetTop + result.offsetHeight) / 2 - card.clientHeight / 2),
            captionGap: result.offsetTop - caption.offsetTop - caption.offsetHeight,
          };
        }));
        for (const outcome of outcomes) {
          expect(outcome.horizontalCenter, `${width}px: both text blocks stay horizontally centered`).toBeLessThan(1);
          expect(outcome.verticalCenter, `${width}px: caption and win text stay centered as a group`).toBeLessThan(1);
          expect(outcome.captionGap).toBeGreaterThanOrEqual(5);
          expect(outcome.captionGap).toBeLessThanOrEqual(7);
        }
      }
      const heading = await page.locator('.tutorial-copy').evaluate((element) => {
        const title = element.querySelector('h2')!;
        const text = element.querySelector('.tutorial-title-text')!;
        const icon = element.querySelector('.step-icon')!;
        const paragraph = element.querySelector('p')!;
        return {
          size: Number.parseFloat(getComputedStyle(title).fontSize),
          iconTopDifference: Math.abs(icon.getBoundingClientRect().top - text.getBoundingClientRect().top),
          iconFirstLineDifference: Math.abs(icon.getBoundingClientRect().height - Number.parseFloat(getComputedStyle(text).lineHeight)),
          paragraphAlignment: Math.abs(paragraph.getBoundingClientRect().left - text.getBoundingClientRect().left),
          fits: text.scrollWidth <= text.clientWidth,
        };
      });
      expect(heading.size).toBeGreaterThanOrEqual(20);
      expect(heading.size).toBeLessThanOrEqual(24);
      expect(heading.iconTopDifference).toBeLessThan(1);
      expect(heading.iconFirstLineDifference).toBeLessThan(1);
      expect(heading.paragraphAlignment).toBeLessThan(1);
      expect(heading.fits).toBe(true);
      const text = await scene.evaluate((element) => {
        const sceneBox = element.getBoundingClientRect();
        const luminance = (color: string) => {
          const channels = color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map((channel) => {
            const value = channel / 255;
            return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
          });
          return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
        };
        return Array.from(element.querySelectorAll<HTMLElement>('small, strong, .tutorial-round-badge'), (item) => {
          const css = getComputedStyle(item);
          let surface: Element = item;
          while (getComputedStyle(surface).backgroundColor === 'rgba(0, 0, 0, 0)' && surface.parentElement) surface = surface.parentElement;
          const foreground = luminance(css.color);
          const background = luminance(getComputedStyle(surface).backgroundColor);
          const range = document.createRange();
          range.selectNodeContents(item);
          const lines = Array.from(range.getClientRects());
          const surfaceBox = surface.getBoundingClientRect();
          return {
            text: item.textContent,
            label: item.matches('small'),
            badge: item.matches('.tutorial-round-badge'),
            size: Number.parseFloat(css.fontSize),
            weight: css.fontWeight,
            sameFontAsBody: css.fontFamily === getComputedStyle(document.body).fontFamily,
            transform: css.textTransform,
            contrast: (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05),
            fits: lines.every((line) => line.left >= sceneBox.left && line.right <= sceneBox.right && line.top >= sceneBox.top && line.bottom <= sceneBox.bottom),
            fitsSurface: lines.every((line) => line.left >= surfaceBox.left && line.right <= surfaceBox.right && line.top >= surfaceBox.top && line.bottom <= surfaceBox.bottom),
            unobscured: lines.every((line) => item.contains(document.elementFromPoint(line.x + line.width / 2, line.y + line.height / 2))),
          };
        });
      });
      for (const item of text) {
        const context = `${width}px step ${step + 1}: ${item.text}`;
        expect(item.size, context).toBeGreaterThanOrEqual(12);
        expect(item.sameFontAsBody, context).toBe(true);
        expect(item.transform, context).toBe(item.badge ? 'uppercase' : 'none');
        expect(item.contrast, context).toBeGreaterThanOrEqual(4.5);
        expect(item.fits, context).toBe(true);
        expect(item.fitsSurface, context).toBe(true);
        expect(item.unobscured, context).toBe(true);
        if (item.label) expect(item, context).toMatchObject({ size: 12, weight: '500' });
      }
      if (step === 1) {
        await expect(scene.locator('.secret-stamp')).toHaveCSS('background-color', 'rgb(23, 35, 25)');
        await expect(scene.locator('.secret-stamp')).toHaveCSS('color', 'rgb(255, 255, 255)');
      }
      if ([320, 636, 1280].includes(width)) {
        await scene.screenshot({ path: testInfo.outputPath(`tutorial-type-${step + 1}-${width}.png`) });
      }
    }
    expect(compositions.size, `${width}px: steps have distinct compositions`).toBeGreaterThanOrEqual(3);
  }
});

test('interactive tutorial fills a 16:9 first viewport without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Can you fool the AI Detective/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Start with honest answers' })).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Start a game' })).toBeInViewport();
  const firstStepsY = (await page.locator('.tutorial-steps').boundingBox())?.y;
  await page.getByRole('button', { name: /Show step 2: Get secret roles/i }).click();
  await expect(page.getByRole('heading', { name: 'Get secret roles' })).toBeVisible();
  expect((await page.locator('.tutorial-steps').boundingBox())?.y).toBe(firstStepsY);
  await page.getByRole('button', { name: /Show step 4: Object once/i }).click();
  await expect(page.getByRole('heading', { name: 'Object once, before you know' })).toBeVisible();
  expect((await page.locator('.tutorial-steps').boundingBox())?.y).toBe(firstStepsY);
  await page.getByRole('button', { name: /Show step 5: Make the AI accuse/i }).click();
  await expect(page.getByRole('heading', { name: 'Make the AI accuse the wrong player' })).toBeVisible();
  expect((await page.locator('.tutorial-steps').boundingBox())?.y).toBe(firstStepsY);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1280);
  const tutorialBox = await page.locator('.tutorial').boundingBox();
  expect(tutorialBox?.y).toBeGreaterThan(80);
  expect((tutorialBox?.y ?? 0) + (tutorialBox?.height ?? 0)).toBeLessThanOrEqual(700);
});

test('page-wide tutorial arrows work before clicking and preserve the pointer selection style', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    Object.defineProperty(document, 'modelContext', { configurable: true, value: { registerTool: async () => {} } });
  });
  await page.goto('/');
  // Wait for the browser-side check so keyboard input reaches hydrated handlers.
  await expect(page.getByRole('button', { name: 'Start a game' })).toBeEnabled();
  const steps = page.getByRole('list', { name: 'Game rules' }).getByRole('button');
  for (const index of [1, 2, 3, 4, 0]) {
    await page.keyboard.press('ArrowRight');
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
    await expect(steps.nth(index)).toHaveAttribute('aria-current', 'step');
    await expect(page.getByText(`Step ${index + 1} of 5`, { exact: true })).toBeVisible();
    await expect(steps.nth(index)).toHaveCSS('outline-style', 'none');
    await expect(steps.nth(index)).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  }
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('heading', { name: 'Make the AI accuse the wrong player' })).toBeVisible();
  const arrowStyle = await steps.nth(4).evaluate((element) => {
    const style = getComputedStyle(element);
    return { background: style.backgroundColor, shadow: style.boxShadow, outline: style.outlineStyle };
  });
  await steps.nth(3).click();
  await steps.nth(4).click();
  expect(await steps.nth(4).evaluate((element) => {
    const style = getComputedStyle(element);
    return { background: style.backgroundColor, shadow: style.boxShadow, outline: style.outlineStyle };
  })).toEqual(arrowStyle);
  await steps.nth(4).focus();
  await page.keyboard.press('Home');
  await expect(steps.nth(0)).toBeFocused();
  await page.keyboard.press('End');
  await expect(steps.nth(4)).toBeFocused();
  await expect(steps.nth(4)).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await page.keyboard.press('ArrowLeft');
  await expect(steps.nth(3)).toBeFocused();
  await expect(steps.nth(3)).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  expect(await steps.evaluateAll((buttons) => buttons.filter((button) => button.getAttribute('tabindex') === '0').length)).toBe(1);
  await page.locator('.tutorial-scene').evaluate(async (scene) => {
    await Promise.all(scene.getAnimations({ subtree: true }).map((animation) => animation.finished));
  });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('tutorial-keyboard.png'), fullPage: true });
});

test('headline keeps readable spacing and fits narrow and wide layouts', async ({ page }) => {
  await page.goto('/');
  const heading = page.getByRole('heading', { name: 'Can you fool the AI Detective?', exact: true });
  for (const width of [320, 390, 780, 781, 820, 900, 1280]) {
    await page.setViewportSize({ width, height: 720 });
    const layout = await heading.evaluate((element) => {
      const style = getComputedStyle(element);
      const bounds = element.getBoundingClientRect();
      const description = element.nextElementSibling!.getBoundingClientRect();
      const fontSize = Number.parseFloat(style.fontSize);
      return {
        lineHeight: Number.parseFloat(style.lineHeight) / fontSize,
        letterSpacing: Number.parseFloat(style.letterSpacing) / fontSize,
        fits: element.scrollWidth <= element.clientWidth,
        left: bounds.left,
        right: bounds.right,
        gapBelow: description.top - bounds.bottom,
      };
    });
    expect(layout.lineHeight).toBeGreaterThanOrEqual(1);
    expect(layout.letterSpacing).toBeGreaterThanOrEqual(-0.04);
    expect(layout.fits, `headline should fit at ${width}px`).toBe(true);
    expect(layout.left).toBeGreaterThanOrEqual(0);
    expect(layout.right).toBeLessThanOrEqual(width);
    expect(layout.gapBelow).toBeGreaterThan(0);
  }
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
