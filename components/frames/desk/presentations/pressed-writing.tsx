import type { ManuscriptEffect } from '@/lib/manuscript/read-model';
import { factLines } from './helpers';
import type { DeskPresentation } from './types';

/**
 * Renders each sealed fact as a rubbed-through note: the first line is the
 * raised fragment, any remaining lines are the note beneath it.
 */
function PressedWritingArtifact({
  effect,
  fresh = false,
}: {
  effect: ManuscriptEffect;
  fresh?: boolean;
}) {
  return (
    <figure
      className={`story-artifact notepad-artifact${fresh ? ' is-revealed' : ''}`}
    >
      <figcaption>{effect.title}</figcaption>
      {effect.facts.map((fact) => {
        const { lead, note } = factLines(fact.value);
        return (
          <div key={fact.id}>
            <p className="revealed-fragment">{lead}</p>
            {note ? <p>{note}</p> : null}
          </div>
        );
      })}
    </figure>
  );
}

export const pressedWriting: DeskPresentation = {
  announce: 'Pressed writing has surfaced on the page.',
  render: (effect, fresh) => (
    <PressedWritingArtifact effect={effect} fresh={fresh} />
  ),
};
