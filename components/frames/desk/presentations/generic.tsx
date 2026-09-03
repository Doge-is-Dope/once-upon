import type { ManuscriptEffect } from '@/lib/manuscript/read-model';
import { effectParagraphs } from './helpers';
import type { DeskPresentation } from './types';

function GenericStoryEffect({ effect }: { effect: ManuscriptEffect }) {
  return (
    <section className="story-artifact generic-story-effect">
      <h3>{effect.title}</h3>
      {effectParagraphs(effect).map((paragraph, index) => (
        <p key={`${effect.receiptId}-effect-${index}`}>{paragraph}</p>
      ))}
    </section>
  );
}

export const generic: DeskPresentation = {
  announce: 'The page has changed.',
  render: (effect) => <GenericStoryEffect effect={effect} />,
};
