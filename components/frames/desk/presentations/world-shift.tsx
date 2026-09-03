import type { ManuscriptEffect } from '@/lib/manuscript/read-model';
import { factParagraphs } from './helpers';
import type { DeskPresentation } from './types';

function WorldShift({ effect }: { effect: ManuscriptEffect }) {
  return (
    <section className="world-shift" data-effect-receipt={effect.receiptId}>
      <h3>{effect.title}</h3>
      {effect.facts.flatMap((fact) => {
        return factParagraphs(fact.value).map((paragraph, index) => (
          <p key={`${fact.id}-paragraph-${index}`}>{paragraph}</p>
        ));
      })}
    </section>
  );
}

export const worldShift: DeskPresentation = {
  announce: 'The world beyond the page has changed.',
  render: (effect) => <WorldShift effect={effect} />,
};
