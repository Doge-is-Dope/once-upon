'use client';

import type { ExperienceSession } from '@/lib/runtime/types';
import { useBookUi } from './book-ui-context';
import { CopyButton } from './copy-button';
import { useExperience } from './experience-context';
import { affordanceMessage } from './formatters';

const MAX_VISIBLE_MOVES = 3;

// Surfaces the current affordances directly on the page so a new player
// always sees concrete options. Fully derived from the session; the ledger
// keeps the complete list.
export function NextMoves({ session }: { session: ExperienceSession }) {
  const { story } = useExperience();
  const { openLedger } = useBookUi();
  const affordances = story.getAffordances(session);
  const moves = affordances
    .filter((affordance) => affordance.id !== 'improvise')
    .slice(0, MAX_VISIBLE_MOVES);
  const improvise = affordances.find(
    (affordance) => affordance.id === 'improvise',
  );
  if (!moves.length && !improvise) return null;
  const specialty = session.character.specialty;
  return (
    <aside className="next-moves" aria-label="Things you could try">
      <h3>You could try…</h3>
      <ul>
        {moves.map((affordance) => (
          <li key={affordance.id}>
            <div>
              <strong>{affordance.label}</strong>
              <p>{affordance.description}</p>
              {affordance.suggestedApproaches.includes(specialty) ? (
                <small className="strength-note">Plays to your strength</small>
              ) : null}
            </div>
            <CopyButton
              className="affordance-copy"
              text={affordanceMessage(affordance)}
              idleLabel="Copy"
            />
          </li>
        ))}
      </ul>
      <footer className="next-moves-footer">
        {improvise ? <p>{improvise.description}</p> : null}
        <button type="button" className="ledger-link" onClick={openLedger}>
          All options are in the ledger
        </button>
      </footer>
    </aside>
  );
}
