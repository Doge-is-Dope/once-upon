import { describe, expect, it } from 'vitest';
import { ExperienceController } from '../lib/runtime/controller';
import type { ExperienceStore } from '../lib/runtime/store';
import { fixtureExperience } from './fixtures';

function failingStore(): ExperienceStore {
  return {
    read: () => Promise.resolve(null),
    write: () => Promise.reject(new Error('IDB_WRITE_FAILED')),
    mutate: () => Promise.reject(new Error('IDB_WRITE_FAILED')),
    clear: () => Promise.reject(new Error('IDB_WRITE_FAILED')),
    quarantineCorrupt: () => Promise.reject(new Error('IDB_WRITE_FAILED')),
  };
}

const actionInput = {
  operationId: 'op_fault_1',
  expectedRevision: 1,
  targetId: 'inspect_signal',
  approach: 'focus',
  intent: 'I inspect the signal.',
};

describe('ExperienceController fault reporting', () => {
  it('notifies fault listeners when a persisted action cannot be saved', async () => {
    const controller = new ExperienceController(
      fixtureExperience(),
      failingStore(),
    );
    const faults: string[] = [];
    controller.subscribeToFaults((message) => faults.push(message));

    await expect(controller.performAction(actionInput, 12)).rejects.toThrow(
      'IDB_WRITE_FAILED',
    );
    expect(faults).toEqual([
      'The last turn could not be saved to this device.',
    ]);
  });

  it('notifies fault listeners when narration cannot be saved', async () => {
    const controller = new ExperienceController(
      fixtureExperience(),
      failingStore(),
    );
    const faults: string[] = [];
    controller.subscribeToFaults((message) => faults.push(message));

    await expect(
      controller.commitNarration({
        operationId: 'op_fault_2',
        expectedRevision: 1,
        resolutionId: 'res_x',
        representedEventIds: ['event_x'],
        payload: { format: 'prose', text: 'x'.repeat(100) },
      }),
    ).rejects.toThrow('IDB_WRITE_FAILED');
    expect(faults).toHaveLength(1);
  });

  it('notifies fault listeners when restart cannot clear the store', async () => {
    const controller = new ExperienceController(
      fixtureExperience(),
      failingStore(),
    );
    const faults: string[] = [];
    controller.subscribeToFaults((message) => faults.push(message));

    await expect(controller.restart()).rejects.toThrow('IDB_WRITE_FAILED');
    expect(faults).toEqual([
      'The old story could not be cleared from this device.',
    ]);
  });

  it('stops notifying after unsubscribe', async () => {
    const controller = new ExperienceController(
      fixtureExperience(),
      failingStore(),
    );
    const faults: string[] = [];
    const unsubscribe = controller.subscribeToFaults((message) =>
      faults.push(message),
    );
    unsubscribe();

    await expect(controller.restart()).rejects.toThrow();
    expect(faults).toEqual([]);
  });
});
