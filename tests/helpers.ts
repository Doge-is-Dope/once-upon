import type { EngineContext } from '../lib/runtime/types';

export function testContext(): EngineContext {
  let sequence = 0;
  return {
    now: () => 1_700_000_000_000 + sequence,
    id: (prefix) => `${prefix}_test_${++sequence}`,
  };
}

export const ordinaryProse =
  'You follow the choice across the quiet room. The handleless door stays shut, the torn notebook remains on the table, and a measured current of air passes behind the wardrobe. Nothing answers for you; the speaker waits while you decide what to examine next.';

export function operationId(prefix: string, index = 1) {
  return `${prefix}_${String(index).padStart(6, '0')}`;
}
