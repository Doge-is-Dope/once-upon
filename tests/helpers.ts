import type { EngineContext } from '../lib/runtime/types';

export function testContext(): EngineContext {
  let sequence = 0;
  return {
    now: () => 1_700_000_000_000 + sequence,
    id: (prefix) => `${prefix}_test_${++sequence}`,
  };
}

export const ordinaryProse =
  'You follow the choice across the quiet study. The handleless door stays shut, the ledger remains open on the desk, and the lamp keeps its steady light. Nothing answers for you; the voice waits while you decide what to examine next.';

export const ordinaryRecordProse =
  'The subject follows the choice across the quiet study. The handleless door stays shut, the ledger remains open on the desk, and the lamp keeps its steady light. Nothing answers for the subject; the voice waits while the subject decides what to examine next.';

export function operationId(prefix: string, index = 1) {
  return `${prefix}_${String(index).padStart(6, '0')}`;
}
