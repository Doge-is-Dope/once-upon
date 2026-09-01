import { expect, type Page } from '@playwright/test';

export type BrowserTool = {
  name: string;
  execute(
    input: Record<string, unknown>,
    options?: { signal?: AbortSignal },
  ): unknown;
};

declare global {
  interface Window {
    __webMCPTools: Map<string, BrowserTool>;
    __connectionTools: Map<string, BrowserTool>;
    __webMCPRegistrationHistory: string[];
    __webMCPAbortHistory: string[];
    __mcpFailName: string | null;
    __mcpPermissionDenied: boolean;
  }
}

export async function callTool<T>(
  page: Page,
  name: string,
  input: Record<string, unknown>,
): Promise<T> {
  return page.evaluate(
    async ({ toolName, toolInput }) => {
      const tools = window.__webMCPTools;
      const tool = tools.get(toolName);
      if (!tool) throw new Error(`Tool ${toolName} is not registered.`);
      return await tool.execute(toolInput);
    },
    { toolName: name, toolInput: input },
  ) as Promise<T>;
}

export async function waitForTool(page: Page, name: string): Promise<void> {
  await expect
    .poll(() => page.evaluate((tool) => window.__webMCPTools.has(tool), name))
    .toBe(true);
}

export interface ModelContextMockOptions {
  globalName: '__webMCPTools' | '__connectionTools';
  dispatchToolChange?: boolean;
  respectOptOut?: boolean;
  failureInjection?: boolean;
  initialFailure?: 'permission' | 'error';
  registrationBudget?: number;
}

export async function installModelContextMock(
  page: Page,
  options: ModelContextMockOptions,
): Promise<void> {
  const config = {
    dispatchToolChange: false,
    respectOptOut: false,
    failureInjection: false,
    initialFailure: undefined,
    registrationBudget: 0,
    ...options,
  };
  await page.addInitScript((mock) => {
    if (
      mock.respectOptOut &&
      sessionStorage.getItem('__disableWebMCPMock') === '1'
    )
      return;
    type MockTool = {
      name: string;
      execute(
        input: Record<string, unknown>,
        options?: { signal?: AbortSignal },
      ): unknown;
    };
    const tools = new Map<string, MockTool>();
    const registrations: string[] = [];
    const aborts: string[] = [];
    let initialFailure = mock.initialFailure;
    const modelContext = new EventTarget() as EventTarget & {
      registerTool(
        tool: MockTool,
        options?: { signal?: AbortSignal },
      ): Promise<void>;
      getTools(): Promise<Array<{ name: string }>>;
    };
    modelContext.registerTool = async (tool, options) => {
      if (initialFailure) {
        const failure = initialFailure;
        initialFailure = undefined;
        if (failure === 'permission')
          throw new DOMException('site tools are disabled', 'NotAllowedError');
        throw new Error('registration refused');
      }
      if (
        mock.registrationBudget > 0 &&
        registrations.length >= mock.registrationBudget
      )
        throw new Error('WebMCP configuration exceeds supported limits.');
      if (mock.failureInjection) {
        if (window.__mcpPermissionDenied)
          throw new DOMException('site tools are disabled', 'NotAllowedError');
        if (window.__mcpFailName === tool.name)
          throw new Error('registration refused');
      }
      registrations.push(tool.name);
      tools.set(tool.name, tool);
      options?.signal?.addEventListener(
        'abort',
        () => {
          aborts.push(tool.name);
          if (tools.get(tool.name) === tool) tools.delete(tool.name);
        },
        { once: true },
      );
      if (mock.dispatchToolChange)
        modelContext.dispatchEvent(new Event('toolchange'));
    };
    modelContext.getTools = async () =>
      [...tools.keys()].map((name) => ({ name }));
    if (mock.failureInjection) {
      window.__mcpFailName = null;
      window.__mcpPermissionDenied = false;
    }
    Object.defineProperty(document, 'modelContext', {
      configurable: true,
      value: modelContext,
    });
    Object.defineProperty(window, mock.globalName, {
      configurable: true,
      value: tools,
    });
    Object.defineProperty(window, '__webMCPRegistrationHistory', {
      configurable: true,
      value: registrations,
    });
    Object.defineProperty(window, '__webMCPAbortHistory', {
      configurable: true,
      value: aborts,
    });
  }, config);
}
