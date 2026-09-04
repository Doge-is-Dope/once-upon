import type { ManuscriptEffect } from '@/lib/manuscript/read-model';
import { factParagraphs } from './helpers';
import type { DeskPresentation } from './types';

/**
 * Shows the interaction's first sealed fact as a remembered scene, then each
 * further fact as a present-time return under its authored heading: what the
 * room does once the eyes open belongs on the page, not only in the receipt.
 */
function MemoryFlashback({
  effect,
  fresh,
}: {
  effect: ManuscriptEffect;
  fresh: boolean;
}) {
  const [memory, ...returns] = effect.facts;
  if (!memory) return null;
  return (
    <>
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
      {returns.map((fact) => (
        <section
          className="memory-return"
          data-effect-receipt={effect.receiptId}
          key={`${effect.receiptId}-${fact.id}`}
        >
          <p className="eyebrow">{fact.heading ?? 'Afterward'}</p>
          {factParagraphs(fact.value).map((paragraph, index) => (
            <p key={`${effect.receiptId}-${fact.id}-${index}`}>{paragraph}</p>
          ))}
        </section>
      ))}
    </>
  );
}

export const memoryFlashback: DeskPresentation = {
  announce: 'A memory has been added to the manuscript.',
  render: (effect, fresh) => <MemoryFlashback effect={effect} fresh={fresh} />,
};
