import { expect, test } from '@playwright/test';

declare global {
  interface Window {
    __mcpFail: boolean;
  }
}

test('offers a visible retry when WebMCP registration fails', async ({
  page,
}) => {
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
      if (window.__mcpFail) throw new Error('registration refused');
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
    window.__mcpFail = true;
    Object.defineProperty(document, 'modelContext', {
      configurable: true,
      value: modelContext,
    });
  });
  await page.goto('/');

  await expect(
    page.getByText('The page could not offer its tools to ChatGPT', {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Begin the manuscript' }),
  ).toBeDisabled();

  await page.evaluate(() => {
    window.__mcpFail = false;
  });
  await page.getByRole('button', { name: 'Try connecting again' }).click();
  await expect(page.getByText('ChatGPT connected')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Begin the manuscript' }),
  ).toBeEnabled();
});
