import type { ManuscriptEffect } from '@/lib/manuscript/read-model';
import { factParagraphs } from './helpers';
import type { DeskPresentation } from './types';

/**
 * Shows the interaction's first sealed fact as a remembered scene. Further
 * facts stay on the receipt for the agent to carry into the chapter.
 */
function MemoryFlashback({
  effect,
  fresh,
}: {
  effect: ManuscriptEffect;
  fresh: boolean;
}) {
  const memory = effect.facts[0];
  if (!memory) return null;
  return (
    <section
      className={`memory-flashback${fresh ? ' is-fresh' : ''}`}
      data-effect-receipt={effect.receiptId}
    >
      <h3>Memory</h3>
      <div className="memory-flashback-prose">
        {factParagraphs(memory.value).map((paragraph, index) => (
          <p key={`${effect.receiptId}-memory-${index}`}>{paragraph}</p>
        ))}
      </div>
    </section>
  );
}

export const memoryFlashback: DeskPresentation = {
  announce: 'A memory has been added to the manuscript.',
  render: (effect, fresh) => <MemoryFlashback effect={effect} fresh={fresh} />,
};
