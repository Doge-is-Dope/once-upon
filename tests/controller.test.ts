import { describe, expect, it } from 'vitest';
import { GameController } from '../lib/game/controller';
import type { SessionStore } from '../lib/game/store';

function failingStore(): SessionStore {
  return {
    read: () => Promise.resolve(null),
    write: () => Promise.reject(new Error('IDB_WRITE_FAILED')),
    mutate: () => Promise.reject(new Error('IDB_WRITE_FAILED')),
    clear: () => Promise.reject(new Error('IDB_WRITE_FAILED')),
    quarantineCorrupt: () => Promise.reject(new Error('IDB_WRITE_FAILED')),
  } as unknown as SessionStore;
}

const actionInput = {
  operationId: 'op_fault_1',
  expectedRevision: 1,
  targetId: 'search_hearth',
  approach: 'wits' as const,
  intent: 'I search the hearth.',
};

describe('GameController fault reporting', () => {
  it('notifies fault listeners when a persisted action cannot be saved', async () => {
    const controller = new GameController(failingStore());
    const faults: string[] = [];
    controller.subscribeToFaults((message) => faults.push(message));

    await expect(controller.performAction(actionInput, 12)).rejects.toThrow(
      'IDB_WRITE_FAILED',
    );
    expect(faults).toEqual([
      'The last turn could not be saved to this device.',
    ]);
  });

  it('notifies fault listeners when a manuscript write cannot be saved', async () => {
    const controller = new GameController(failingStore());
    const faults: string[] = [];
    controller.subscribeToFaults((message) => faults.push(message));

    await expect(
      controller.writeManuscript({
        operationId: 'op_fault_2',
        expectedRevision: 1,
        resolutionId: 'res_x',
        representedEventIds: ['event_x'],
        prose: 'x'.repeat(100),
      }),
    ).rejects.toThrow('IDB_WRITE_FAILED');
    expect(faults).toHaveLength(1);
  });

  it('notifies fault listeners when restart cannot clear the store', async () => {
    const controller = new GameController(failingStore());
    const faults: string[] = [];
    controller.subscribeToFaults((message) => faults.push(message));

    await expect(controller.restart()).rejects.toThrow('IDB_WRITE_FAILED');
    expect(faults).toEqual([
      'The old manuscript could not be cleared from this device.',
    ]);
  });

  it('stops notifying after unsubscribe', async () => {
    const controller = new GameController(failingStore());
    const faults: string[] = [];
    const unsubscribe = controller.subscribeToFaults((message) =>
      faults.push(message),
    );
    unsubscribe();

    await expect(controller.restart()).rejects.toThrow();
    expect(faults).toEqual([]);
  });
});
