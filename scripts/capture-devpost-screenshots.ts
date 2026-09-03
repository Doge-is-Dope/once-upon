import { chromium, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const baseUrl =
  process.env.ONCE_UPON_SCREENSHOT_URL ??
  'https://once-upon.clement-liang.chatgpt.site';
const experienceUrl = new URL(
  '/experiences/the-last-manuscript',
  baseUrl,
).toString();
const outputDir = resolve('artifacts/devpost-screenshots');
let sequence = 0;

type StoryState = {
  phase: 'READY' | 'AWAITING_CHAPTER' | 'COMPLETE';
  revision: number;
  sessionId: string;
  pending: null | {
    turnId: string;
    effectReceipt: null | {
      receiptId: string;
      factIds: string[];
    };
  };
};

type ToolResult = {
  structuredContent: {
    ok: boolean;
    state: StoryState;
    turnId?: string;
    effectReceipt?: { receiptId: string; factIds: string[] };
  };
};

await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 960 },
  deviceScaleFactor: 1.5,
  colorScheme: 'light',
  reducedMotion: 'reduce',
});
const page = await context.newPage();

await installModelContextMock(page);
await page.goto(experienceUrl, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await waitForTool(page, 'get_story_state');
await page.waitForTimeout(500);

await capture(page, '01-opening-manuscript.png');

let state = await readState(page);
const begun = await callTool<ToolResult>(page, 'begin_story_turn', {
  operationId: operationId('begin'),
  expectedSessionId: state.sessionId,
  expectedRevision: state.revision,
  playerChoice:
    'I search beneath the desk for anything the room has tried to hide.',
});
state = begun.structuredContent.state;
await page.locator('.pending-move').waitFor({ state: 'visible' });
await page.waitForTimeout(250);
await capture(page, '02-player-action-agent-writing.png');

state = await commit(
  page,
  state,
  begun.structuredContent.turnId!,
  'The pencil beneath the desk',
  ['pencil_found'],
  'continue',
  {
    prose:
      'Your fingertips meet wood beneath the desk: a pencil, worn almost to the ferrule. When you lift it into the lamplight, the blank notepad no longer looks empty. Shallow grooves cross its top page, the pressure of words removed before you arrived.',
    recordProse:
      'The subject retrieves a worn pencil from beneath the desk. Under the lamp, shallow impressions become visible across the blank notepad, left by writing removed before the subject arrived.',
    continuitySummary:
      'A worn pencil has been recovered from beneath the desk, and the blank notepad shows shallow impressions that may be revealed by shading.',
  },
);
await settleTyping(page);

const notes = page.getByRole('button', {
  name: /^Open clue notebook/,
});
await notes.click();
await page.locator('.story-clues-sheet').waitFor({ state: 'visible' });
await capture(page, '03-pencil-discovery-notes.png');
await page.keyboard.press('Escape');

await page.getByRole('button', { name: 'Settings', exact: true }).click();
const inspectorToggle = page.getByRole('checkbox', {
  name: 'Tool inspector',
});
if (!(await inspectorToggle.isChecked())) await inspectorToggle.click();
await page.locator('.webmcp-inspector').waitFor({ state: 'visible' });
await page.keyboard.press('Escape');
await page.locator('.webmcp-inspector > summary').click();
await page.locator('.inspector-body').waitFor({ state: 'visible' });
await page.locator('.webmcp-inspector').scrollIntoViewIfNeeded();
await capture(page, '04-webmcp-tool-inspector.png');
await page.getByRole('button', { name: 'Settings', exact: true }).click();
await inspectorToggle.click();
await page.keyboard.press('Escape');

state = await interactionTurn(
  page,
  state,
  'reveal_pressed_words',
  'I turn the pencil sideways and shade across the notepad until the missing words return.',
  'The missing page answers',
  'continue',
);
await settleTyping(page);

state = await interactionTurn(
  page,
  state,
  'follow_north_station_memory',
  'I close my eyes and follow the remembered North Station announcement back to its source.',
  'Memory at 5:41',
  'continue',
);
await settleTyping(page);

state = await ordinaryTurn(
  page,
  state,
  'I pull the wardrobe aside and take the sewn papers from the maintenance recess.',
  ['manuscript_found'],
  'The papers behind the wardrobe',
);
await settleTyping(page);

state = await interactionTurn(
  page,
  state,
  'read_the_last_manuscript',
  'I open the sewn manuscript and read every page before the door opens.',
  'The corridor beyond Room Seven',
  'complete',
);

await settleTyping(page);
await page
  .getByText('Nothing is uploaded until you choose to.')
  .waitFor({ state: 'visible', timeout: 35_000 });
const nextPage = page.getByRole('button', { name: 'Next page' });
while (await nextPage.isEnabled()) {
  await nextPage.click();
  await page.waitForTimeout(180);
}
await page.getByRole('button', { name: 'Previous page' }).click();
await capture(page, '05-completed-manuscript.png');

await browser.close();

async function capture(page: Page, filename: string): Promise<void> {
  await page.screenshot({
    path: resolve(outputDir, filename),
    fullPage: false,
    animations: 'disabled',
  });
}

async function installModelContextMock(page: Page): Promise<void> {
  await page.addInitScript(() => {
    type MockTool = {
      name: string;
      execute(
        input: Record<string, unknown>,
        options?: { signal?: AbortSignal },
      ): unknown;
    };
    const tools = new Map<string, MockTool>();
    const modelContext = new EventTarget() as EventTarget & {
      registerTool(
        tool: MockTool,
        options?: { signal?: AbortSignal },
      ): Promise<void>;
      getTools(): Promise<Array<{ name: string }>>;
    };
    modelContext.registerTool = async (tool, options) => {
      tools.set(tool.name, tool);
      options?.signal?.addEventListener(
        'abort',
        () => {
          if (tools.get(tool.name) === tool) tools.delete(tool.name);
        },
        { once: true },
      );
      modelContext.dispatchEvent(new Event('toolchange'));
    };
    modelContext.getTools = async () =>
      [...tools.keys()].map((name) => ({ name }));
    Object.defineProperty(document, 'modelContext', {
      configurable: true,
      value: modelContext,
    });
    Object.defineProperty(window, '__webMCPTools', {
      configurable: true,
      value: tools,
    });
  });
}

async function callTool<T>(
  page: Page,
  name: string,
  input: Record<string, unknown>,
): Promise<T> {
  return page.evaluate(
    async ({ toolName, toolInput }) => {
      const tools = (
        window as unknown as {
          __webMCPTools: Map<
            string,
            { execute(input: Record<string, unknown>): unknown }
          >;
        }
      ).__webMCPTools;
      const tool = tools.get(toolName);
      if (!tool) throw new Error(`Tool ${toolName} is not registered.`);
      return await tool.execute(toolInput);
    },
    { toolName: name, toolInput: input },
  ) as T;
}

async function waitForTool(page: Page, name: string): Promise<void> {
  await page.waitForFunction(
    (toolName) =>
      (
        window as unknown as {
          __webMCPTools?: Map<string, unknown>;
        }
      ).__webMCPTools?.has(toolName) === true,
    name,
  );
}

async function readState(page: Page): Promise<StoryState> {
  const result = await callTool<ToolResult>(page, 'get_story_state', {});
  return result.structuredContent.state;
}

async function ordinaryTurn(
  page: Page,
  state: StoryState,
  choice: string,
  discoveryIds: string[],
  title: string,
): Promise<StoryState> {
  const begun = await callTool<ToolResult>(page, 'begin_story_turn', {
    operationId: operationId('begin'),
    expectedSessionId: state.sessionId,
    expectedRevision: state.revision,
    playerChoice: choice,
  });
  return commit(
    page,
    begun.structuredContent.state,
    begun.structuredContent.turnId!,
    title,
    discoveryIds,
    'continue',
  );
}

async function interactionTurn(
  page: Page,
  state: StoryState,
  toolName: string,
  choice: string,
  title: string,
  status: 'continue' | 'complete',
): Promise<StoryState> {
  await waitForTool(page, toolName);
  const invoked = await callTool<ToolResult>(page, toolName, {
    operationId: operationId(toolName),
    expectedSessionId: state.sessionId,
    expectedRevision: state.revision,
    playerChoice: choice,
  });
  const receipt = invoked.structuredContent.effectReceipt!;
  return commit(
    page,
    invoked.structuredContent.state,
    invoked.structuredContent.turnId!,
    title,
    [],
    status,
    undefined,
    receipt,
  );
}

async function commit(
  page: Page,
  state: StoryState,
  turnId: string,
  title: string,
  discoveryIds: string[],
  status: 'continue' | 'complete',
  copy: {
    prose: string;
    recordProse: string;
    continuitySummary: string;
  } = {
    prose:
      'You follow the evidence through the quiet room and keep each physical detail in view. The wall speaker waits while the notepad, wardrobe, and handleless door remain where you left them. The next fact comes only from what you examine.',
    recordProse:
      'The subject follows the evidence through the quiet room and keeps each physical detail in view. The wall speaker waits while the notepad, wardrobe, and handleless door remain in place. The next fact comes only from what the subject examines.',
    continuitySummary:
      'The room, notepad, wardrobe, wall speaker, and handleless door remain under examination as the evidence is followed in order.',
  },
  receipt?: { receiptId: string; factIds: string[] },
): Promise<StoryState> {
  const result = await callTool<ToolResult>(page, 'commit_story_chapter', {
    operationId: operationId('chapter'),
    expectedSessionId: state.sessionId,
    expectedRevision: state.revision,
    turnId,
    title,
    prose: copy.prose,
    recordProse: copy.recordProse,
    continuitySummary: copy.continuitySummary,
    discoveryIds,
    status,
    ...(receipt
      ? {
          effectReceiptId: receipt.receiptId,
          representedFactIds: receipt.factIds,
        }
      : {}),
  });
  if (!result.structuredContent.ok)
    throw new Error(`Chapter commit failed at revision ${state.revision}.`);
  return result.structuredContent.state;
}

async function settleTyping(page: Page): Promise<void> {
  const finish = page.locator('.sheet-finish-typing');
  if (await finish.isVisible()) await finish.click();
  await page
    .locator('.story-chapter.is-fresh, .completion-passage.is-fresh')
    .waitFor({ state: 'detached', timeout: 30_000 })
    .catch(() => undefined);
  await page
    .locator('.backspace-replacement')
    .waitFor({ state: 'detached', timeout: 20_000 })
    .catch(() => undefined);
  await page.waitForTimeout(250);
}

function operationId(prefix: string): string {
  sequence += 1;
  return `capture_${prefix.replace(/[^a-z0-9_]/gi, '_')}_${String(sequence).padStart(4, '0')}`;
}
