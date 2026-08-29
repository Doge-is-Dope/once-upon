import { expect, test, type Page } from '@playwright/test';

declare global {
  interface Window {
    __clipboardShouldFail: boolean;
    __connectionTools: Map<string, { name: string }>;
    __copiedText: string;
    __mcpFailName: string | null;
    __mcpPermissionDenied: boolean;
  }
}

async function installRegistrationMock(page: Page): Promise<void> {
  await page.addInitScript(() => {
    type BrowserTool = {
      name: string;
      execute(input: Record<string, unknown>): unknown;
    };
    const tools = new Map<string, BrowserTool>();
    const modelContext = new EventTarget() as EventTarget & {
      registerTool(
        tool: BrowserTool,
        options?: { signal?: AbortSignal },
      ): Promise<void>;
      getTools(): Promise<Array<{ name: string }>>;
    };
    modelContext.registerTool = async (tool, options) => {
      if (window.__mcpPermissionDenied)
        throw new DOMException('site tools are disabled', 'NotAllowedError');
      if (window.__mcpFailName === tool.name)
        throw new Error('registration refused');
      tools.set(tool.name, tool);
      options?.signal?.addEventListener(
        'abort',
        () => {
          if (tools.get(tool.name) === tool) tools.delete(tool.name);
        },
        { once: true },
      );
    };
    modelContext.getTools = async () =>
      [...tools.keys()].map((name) => ({ name }));
    window.__connectionTools = tools;
    window.__mcpFailName = null;
    window.__mcpPermissionDenied = false;
    Object.defineProperty(document, 'modelContext', {
      configurable: true,
      value: modelContext,
    });
  });
}

async function installChromeWithoutWebMCP(
  page: Page,
  clipboardShouldFail = false,
): Promise<void> {
  await page.addInitScript(
    ({ shouldFail }) => {
      Object.defineProperty(navigator, 'userAgentData', {
        configurable: true,
        value: {
          brands: [
            { brand: 'Not_A Brand', version: '99' },
            { brand: 'Google Chrome', version: '149' },
          ],
        },
      });
      window.__clipboardShouldFail = shouldFail;
      window.__copiedText = '';
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async (value: string) => {
            if (window.__clipboardShouldFail)
              throw new Error('clipboard blocked');
            window.__copiedText = value;
          },
        },
      });
    },
    { shouldFail: clipboardShouldFail },
  );
}

test('cleans partial registrations and offers a visible retry', async ({
  page,
}) => {
  await installRegistrationMock(page);
  await page.addInitScript(() => {
    window.__mcpFailName = 'perform_action';
  });
  await page.goto('/');

  await expect(page.getByText("WebMCP couldn't start.")).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start' })).toHaveCount(0);
  expect(await page.evaluate(() => window.__connectionTools.size)).toBe(0);

  await page.evaluate(() => {
    window.__mcpFailName = null;
  });
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('button', { name: 'Start' })).toBeEnabled();
  await expect(page.getByText('ChatGPT connected')).toHaveCount(0);
  expect(await page.evaluate(() => window.__connectionTools.size)).toBe(3);
});

test('explains how to enable WebMCP after a permission denial', async ({
  page,
}) => {
  await installRegistrationMock(page);
  await page.addInitScript(() => {
    window.__mcpPermissionDenied = true;
  });
  await page.goto('/');

  await expect(page.getByText('Turn on WebMCP', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Chrome WebMCP flag URL')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start' })).toHaveCount(0);

  await page.evaluate(() => {
    window.__mcpPermissionDenied = false;
  });
  await page.getByRole('button', { name: 'Check again' }).click();
  await expect(page.getByRole('button', { name: 'Start' })).toBeEnabled();
});

test('offers the Chrome flag and confirms a successful copy inline', async ({
  page,
}) => {
  await installChromeWithoutWebMCP(page);
  await page.goto('/');

  await expect(page.getByText('Turn on WebMCP', { exact: true })).toBeVisible();
  const flag = page.getByLabel('Chrome WebMCP flag URL');
  await expect(flag).toHaveValue('chrome://flags/#enable-webmcp-testing');
  const copyButton = page.getByRole('button', {
    name: 'Copy Chrome flag URL',
  });
  await copyButton.click();

  await expect(page.getByText('Copied', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Chrome flag URL copied' }),
  ).toBeDisabled();
  expect(await page.evaluate(() => window.__copiedText)).toBe(
    'chrome://flags/#enable-webmcp-testing',
  );

  await expect(copyButton).toBeEnabled({ timeout: 6_000 });
  await expect(page.getByText('Copied', { exact: true })).toHaveCount(0);
});

test('keeps the flag selectable when clipboard access fails', async ({
  page,
}) => {
  await installChromeWithoutWebMCP(page, true);
  await page.goto('/');

  const flag = page.getByLabel('Chrome WebMCP flag URL');
  const copyButton = page.getByRole('button', {
    name: 'Copy Chrome flag URL',
  });
  await copyButton.click();

  await expect(page.getByText('Copy failed', { exact: true })).toBeVisible();
  await expect(copyButton).toBeEnabled();
  await expect(flag).toBeFocused();
});
