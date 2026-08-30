import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import {
  activeExperienceKey,
  EXPERIENCE_DB_NAME,
  EXPERIENCE_DB_VERSION,
  EXPERIENCE_STORE_NAME,
} from '../lib/runtime/store';
import { installModelContextMock } from './support/webmcp-mock';

const EXPERIENCE_ID = 'the-last-manuscript';
const legacyStorageConfig = {
  databaseName: 'the-last-manuscript',
  databaseVersion: 1,
  storeName: 'sessions',
  activeKey: 'active',
};

async function installWebMCPMock(page: Page): Promise<void> {
  await installModelContextMock(page, {
    globalName: '__webMCPTools',
    dispatchToolChange: true,
    respectOptOut: true,
  });
}

async function callTool<T>(
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

const storageConfig = {
  databaseName: EXPERIENCE_DB_NAME,
  databaseVersion: EXPERIENCE_DB_VERSION,
  storeName: EXPERIENCE_STORE_NAME,
  activeKey: activeExperienceKey(EXPERIENCE_ID),
};

async function writeExperienceRecord(
  page: Page,
  value: unknown,
): Promise<void> {
  await page.evaluate(
    async ({ config, record }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(
          config.databaseName,
          config.databaseVersion,
        );
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains(config.storeName))
            request.result.createObjectStore(config.storeName);
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(config.storeName, 'readwrite');
        transaction.objectStore(config.storeName).put(record, config.activeKey);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
    },
    { config: storageConfig, record: value },
  );
}

async function readExperienceKeys(page: Page): Promise<IDBValidKey[]> {
  return page.evaluate(async (config) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(
        config.databaseName,
        config.databaseVersion,
      );
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return new Promise<IDBValidKey[]>((resolve, reject) => {
      const request = db
        .transaction(config.storeName, 'readonly')
        .objectStore(config.storeName)
        .getAllKeys();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }, storageConfig);
}

test.beforeEach(async ({ page }) => {
  await installWebMCPMock(page);
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Start' })).toBeVisible();
});

test('shares one save between the default and formal experience routes', async ({
  page,
}) => {
  await page.getByLabel("Your character's name").fill('Mara');
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.getByText("Mara's manuscript")).toBeVisible();

  await page.goto(`/experiences/${EXPERIENCE_ID}`);
  await expect(page.getByText("Mara's manuscript")).toBeVisible();
  await page.goto('/');
  await expect(page.getByText("Mara's manuscript")).toBeVisible();
});

test('serves experience metadata and returns 404 for an unknown ID', async ({
  page,
}) => {
  await expect(page).toHaveTitle('The Last Manuscript | Once Upon');
  await expect(page.locator('meta[name="application-name"]')).toHaveAttribute(
    'content',
    'Once Upon',
  );
  await expect(page.locator('meta[property="og:site_name"]')).toHaveAttribute(
    'content',
    'Once Upon',
  );
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    'content',
    /og\.png$/,
  );

  const response = await page.goto('/experiences/not-registered');
  expect(response?.status()).toBe(404);
});

test('leaves the legacy database untouched and starts with a clean session', async ({
  page,
}) => {
  await page.evaluate(async (config) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(
        config.databaseName,
        config.databaseVersion,
      );
      request.onupgradeneeded = () =>
        request.result.createObjectStore(config.storeName);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(config.storeName, 'readwrite');
      transaction
        .objectStore(config.storeName)
        .put({ broken: true }, config.activeKey);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }, legacyStorageConfig);

  await page.reload();
  await expect(page.getByRole('button', { name: 'Start' })).toBeVisible();
  const legacyRecord = await page.evaluate(async (config) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(
        config.databaseName,
        config.databaseVersion,
      );
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return new Promise<unknown>((resolve, reject) => {
      const request = db
        .transaction(config.storeName, 'readonly')
        .objectStore(config.storeName)
        .get(config.activeKey);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }, legacyStorageConfig);
  expect(legacyRecord).toEqual({ broken: true });
});

test('keeps a saved manuscript readable when WebMCP becomes unavailable', async ({
  page,
}) => {
  await page.getByLabel("Your character's name").fill('Mara');
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.getByText("Mara's manuscript")).toBeVisible();

  await page.evaluate(() => {
    sessionStorage.setItem('__disableWebMCPMock', '1');
  });
  await page.reload();

  await expect(page.getByText("Mara's manuscript")).toBeVisible();
  await expect(
    page.getByText("WebMCP isn't available in this browser."),
  ).toBeVisible();
  await expect(page.getByText('Sample leaves')).toHaveCount(0);
});

test('preserves a saved roll across interruption and forces exact narration', async ({
  page,
}) => {
  await page.getByLabel("Your character's name").fill('Mara');
  await page.getByLabel('Nerve: Stand firm when fear closes in.').check();
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(
    page.getByRole('button', { name: 'Copy the opening message' }),
  ).toBeVisible();
  await expect(page.getByText('Prologue', { exact: true })).toBeVisible();
  await expect(page.locator('.book-reader')).toBeFocused();

  const initial = await callTool<{
    structuredContent: { state: { revision: number } };
  }>(page, 'get_story_state', {});
  expect(initial.structuredContent.state.revision).toBe(1);

  const rolled = await callTool<{
    structuredContent: {
      resolution: {
        resolutionId: string;
        representedEventIds: string[];
        roll: { die: number };
      };
      state: { revision: number };
    };
  }>(page, 'perform_action', {
    operationId: 'e2e_action_001',
    expectedRevision: 1,
    targetId: 'search_hearth',
    approach: 'wits',
    intent: 'I search the dying hearth for anything hidden.',
  });
  const savedDie = rolled.structuredContent.resolution.roll.die;
  const draft = page.locator('[data-leaf-kind="draft"]');
  await expect(
    draft.getByText('Draft Page I', { exact: true }).first(),
  ).toBeVisible();
  await expect(
    draft.getByText('I search the dying hearth for anything hidden.').first(),
  ).toBeVisible();
  await expect(
    page.locator(
      '.book-spread > .book-leaf [data-leaf-kind="draft"] .manuscript-prose',
    ),
  ).toHaveCount(0);
  await expect(
    page.getByText('Roll saved', { exact: true }).first(),
  ).toBeVisible();
  const liveRoll = page.locator(
    '.book-spread > .book-leaf [data-leaf-kind="draft"] .roll-card',
  );
  await expect(liveRoll).toHaveAttribute('data-settling', 'true');
  await expect(liveRoll.locator('.die')).toHaveText(String(savedDie));

  // The recovery escape hatch is reachable immediately, without any timer.
  await draft.getByText('Taking too long?').first().click();
  await expect(
    page.getByRole('button', { name: 'Copy continue message' }).first(),
  ).toBeVisible();

  const ledgerButton = page.getByRole('button', { name: 'Open ledger' });
  await expect(page.locator('.ledger-badge')).toBeVisible();
  await ledgerButton.click();
  await expect(page.locator('.clock-track .is-new')).toHaveCount(1);
  await page.getByRole('button', { name: 'Close ledger' }).click();
  await expect(page.locator('.ledger-badge')).toHaveCount(0);
  await expect(page.locator('.pending-card').first()).toHaveAttribute(
    'data-fresh',
    'true',
  );

  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Copy continue message' }).first(),
  ).toBeVisible();
  await expect(
    page.locator(
      '.book-spread > .book-leaf [data-leaf-kind="draft"] .roll-card',
    ),
  ).toHaveAttribute('data-settling', 'false');
  await expect(page.locator('.pending-card').first()).toHaveAttribute(
    'data-fresh',
    'false',
  );
  await expect(
    page.locator('.pending-card.is-recovering').first(),
  ).toBeVisible();
  await expect(page.locator('.writing-dots')).toHaveCount(0);
  await expect(page.locator('.page-turn-overlay')).toHaveCount(0);

  const blocked = await callTool<{
    structuredContent: {
      ok: false;
      code: string;
      pendingResolution: { roll: { die: number } };
    };
  }>(page, 'perform_action', {
    operationId: 'e2e_action_002',
    expectedRevision: rolled.structuredContent.state.revision,
    targetId: 'search_upstairs_room',
    approach: 'wits',
    intent: 'I go upstairs before the page is written.',
  });
  expect(blocked.structuredContent.code).toBe('NARRATION_REQUIRED');
  expect(blocked.structuredContent.pendingResolution.roll.die).toBe(savedDie);

  await callTool(page, 'commit_narration', {
    operationId: 'e2e_write_001',
    expectedRevision: rolled.structuredContent.state.revision,
    resolutionId: rolled.structuredContent.resolution.resolutionId,
    representedEventIds:
      rolled.structuredContent.resolution.representedEventIds,
    payload: {
      format: 'prose',
      text: 'Mara searched beneath the dying hearth and found the Charred Key where the saved roll said it waited. The clock answered with one low chime, and the raven watched her close her hand around the warm metal.',
    },
  });
  const completed = page.locator(
    '.book-spread > .book-leaf [data-leaf-kind="completed"]',
  );
  await expect(completed).toHaveAttribute('data-new', 'true');
  const streamedProse = completed.getByTestId('streaming-prose');
  await expect(streamedProse).toHaveAttribute('data-streaming', 'true');
  await streamedProse.click();
  await expect(streamedProse).toHaveAttribute('data-streaming', 'false');
  await expect(
    page.getByText('Your turn', { exact: true }).first(),
  ).toBeVisible();
  await expect(page.locator('.sr-live')).toContainText('Page 1');
  await expect(page.getByText('Pages I–II')).toBeVisible();

  // Paging away and back must not replay the typewriter reveal.
  const reader = page.getByRole('region', { name: /Book pages/ });
  await reader.press('ArrowLeft');
  await expect(
    page.getByText('Prologue', { exact: true }).first(),
  ).toBeVisible();
  await reader.press('ArrowRight');
  await expect(
    page
      .locator(
        '.book-spread > .book-leaf [data-leaf-kind="completed"] [data-testid="streaming-prose"]',
      )
      .first(),
  ).toHaveAttribute('data-streaming', 'false');
  await expect(
    page.locator('.book-spread > .book-leaf [data-leaf-kind="completed"]'),
  ).toHaveAttribute('data-new', 'false');

  await ledgerButton.click();
  await expect(
    page.getByRole('dialog', { name: 'Adventure ledger' }),
  ).toBeVisible();
  await expect(
    page
      .getByRole('dialog', { name: 'Adventure ledger' })
      .getByText('Charred Key', { exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole('dialog', { name: 'Adventure ledger' })
      .getByText('Return what the bird has been waiting for.'),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('dialog', { name: 'Adventure ledger' }),
  ).toBeHidden();
  await expect(ledgerButton).toBeFocused();

  // A click on the backdrop closes the ledger too.
  await ledgerButton.click();
  await expect(
    page.getByRole('dialog', { name: 'Adventure ledger' }),
  ).toBeVisible();
  await page.mouse.click(5, 5);
  await expect(
    page.getByRole('dialog', { name: 'Adventure ledger' }),
  ).toBeHidden();
});

test('registers the mirror ability only after the artifact is found', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: 'Start' }).click();
  const rolled = await callTool<{
    structuredContent: {
      resolution: { resolutionId: string; representedEventIds: string[] };
      state: { revision: number };
    };
  }>(page, 'perform_action', {
    operationId: 'e2e_action_mirror',
    expectedRevision: 1,
    targetId: 'search_upstairs_room',
    approach: 'wits',
    intent: "I search the former keeper's room upstairs.",
  });
  await expect(
    page.getByText('Reveal hidden ink', { exact: true }).first(),
  ).toBeVisible();
  const unlockedCard = page.locator('[data-leaf-kind="draft"] .ability-card');
  await expect(unlockedCard.first()).toHaveAttribute('data-new', 'true');
  await expect(
    page.locator('[data-leaf-kind="draft"] .roll-card').first(),
  ).toHaveAttribute('data-settling', 'true');
  await expect(
    page.locator('[data-leaf-kind="draft"] .roll-card').first(),
  ).toHaveCSS('animation-name', 'none');
  await expect(unlockedCard.first()).toHaveCSS('animation-name', 'none');
  await expect(page.locator('.pending-nib').first()).toHaveCSS(
    'animation-name',
    'none',
  );
  // Reduced motion keeps an opacity-only "still working" pulse alive.
  await expect(page.locator('.writing-dots span').first()).toHaveCSS(
    'animation-name',
    'reduced-pulse',
  );
  const names = await page.evaluate(() => [...window.__webMCPTools.keys()]);
  expect(names).toContain('reveal_hidden_ink');

  await callTool(page, 'commit_narration', {
    operationId: 'e2e_write_mirror',
    expectedRevision: rolled.structuredContent.state.revision,
    resolutionId: rolled.structuredContent.resolution.resolutionId,
    representedEventIds:
      rolled.structuredContent.resolution.representedEventIds,
    payload: {
      format: 'prose',
      text: 'Upstairs, the traveler found a Black Mirror Shard inside the empty frame. Its surface reflected the room a heartbeat late, and the page granted ChatGPT a new way to reveal writing hidden from ordinary sight.',
    },
  });
  await expect(page.getByTestId('streaming-prose').first()).toHaveAttribute(
    'data-streaming',
    'false',
  );
  await expect(
    page.locator('[data-leaf-kind="completed"] .ability-card').first(),
  ).toHaveAttribute('data-new', 'false');
  await page.getByRole('button', { name: 'Open ledger' }).click();
  await expect(page.getByText('Ready for ChatGPT')).toBeVisible();
});

test('keeps setup accessible and usable at a 320px viewport', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 760 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(
    page.getByRole('heading', { name: 'The Last Manuscript' }),
  ).toBeVisible();
  await page.getByLabel('Grace: Move softly and win trust.').check();
  await page.getByRole('button', { name: 'Start' }).scrollIntoViewIfNeeded();
  await expect(page.getByRole('button', { name: 'Start' })).toBeVisible();
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});

test('supports history, bookmark follow-up, keyboard, and touch paging', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 820 });
  await page.getByRole('button', { name: 'Start' }).click();
  const first = await callTool<{
    structuredContent: {
      resolution: { resolutionId: string; representedEventIds: string[] };
      state: { revision: number };
    };
  }>(page, 'perform_action', {
    operationId: 'e2e_history_action_1',
    expectedRevision: 1,
    targetId: 'search_hearth',
    approach: 'wits',
    intent: 'Search the hearth.',
  });
  await callTool(page, 'commit_narration', {
    operationId: 'e2e_history_write_1',
    expectedRevision: first.structuredContent.state.revision,
    resolutionId: first.structuredContent.resolution.resolutionId,
    representedEventIds: first.structuredContent.resolution.representedEventIds,
    payload: {
      format: 'prose',
      text: 'The traveler searched through the silent hearth and lifted a Charred Key from the ashes while the first bell moved through the empty tavern.',
    },
  });

  const reader = page.getByRole('region', { name: /Book pages/ });
  await expect(page.getByText('Page I', { exact: true }).first()).toBeVisible();
  await reader.dispatchEvent('pointerdown', {
    pointerType: 'touch',
    clientX: 280,
    clientY: 340,
  });
  await reader.dispatchEvent('pointerup', {
    pointerType: 'touch',
    clientX: 350,
    clientY: 344,
  });
  await expect(
    page.getByText('Prologue', { exact: true }).first(),
  ).toBeVisible();

  await reader.dispatchEvent('pointerdown', {
    pointerType: 'touch',
    clientX: 220,
    clientY: 300,
  });
  await reader.dispatchEvent('pointerup', {
    pointerType: 'touch',
    clientX: 240,
    clientY: 420,
  });
  await expect(
    page.getByText('Prologue', { exact: true }).first(),
  ).toBeVisible();

  await reader.press('ArrowRight');
  await expect(page.getByText('Page I', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Previous page' }).click();
  await expect(
    page.getByText('Prologue', { exact: true }).first(),
  ).toBeVisible();

  await callTool(page, 'perform_action', {
    operationId: 'e2e_history_action_2',
    expectedRevision: first.structuredContent.state.revision + 1,
    targetId: 'search_upstairs_room',
    approach: 'wits',
    intent: 'Search the upstairs room.',
  });
  await expect(
    page.getByText('Prologue', { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'New page ready' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'New page ready' }).click();
  await expect(
    page.getByText('Draft Page II', { exact: true }).first(),
  ).toBeVisible();
  await expect(reader).toBeFocused();

  // Rapid presses interrupt the running page-turn instead of being swallowed.
  await reader.press('ArrowLeft');
  await reader.press('ArrowLeft');
  await expect(
    page.getByText('Prologue', { exact: true }).first(),
  ).toBeVisible();
  await reader.press('ArrowRight');
  await reader.press('ArrowRight');
  await expect(
    page.getByText('Draft Page II', { exact: true }).first(),
  ).toBeVisible();

  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});

test('preserves a corrupt save before explicitly starting over', async ({
  page,
}) => {
  await writeExperienceRecord(page, { broken: true });
  await page.reload();
  await expect(page.getByText('The manuscript stayed closed')).toBeVisible();
  await page.getByRole('button', { name: 'Begin a new manuscript' }).click();
  await expect(page.getByRole('button', { name: 'Start' })).toBeVisible();
  const keys = await readExperienceKeys(page);
  expect(
    keys.some(
      (key) =>
        typeof key === 'string' && key.startsWith(`corrupt:${EXPERIENCE_ID}:`),
    ),
  ).toBe(true);
  expect(keys).not.toContain(storageConfig.activeKey);
});

test('shows an error when the manuscript cannot be saved at setup', async ({
  page,
}) => {
  await page.evaluate(() => {
    IDBObjectStore.prototype.put = () => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    };
  });
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.getByRole('alert')).toContainText('could not be saved');
  await expect(page.getByRole('button', { name: 'Start' })).toBeEnabled();
});

test('restarts the story from the ledger after confirmation', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Start' }).click();
  await callTool(page, 'perform_action', {
    operationId: 'e2e_restart_action',
    expectedRevision: 1,
    targetId: 'search_hearth',
    approach: 'wits',
    intent: 'Search the hearth.',
  });
  await page.getByRole('button', { name: 'Open ledger' }).click();
  await page.getByRole('button', { name: 'Start a new manuscript' }).click();
  await page
    .getByRole('button', { name: 'This erases this manuscript. Start anyway?' })
    .click();
  await expect(page.getByRole('button', { name: 'Start' })).toBeVisible();
  const keys = await readExperienceKeys(page);
  expect(keys).not.toContain(storageConfig.activeKey);
});
