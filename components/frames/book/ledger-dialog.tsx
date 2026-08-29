'use client';

import type { ExperienceSession } from '@/lib/runtime/types';
import { WEBMCP_CLIENT_NAME } from '@/lib/webmcp/tools';
import { RestartButton } from './book-leaf-page';
import { CopyButton } from './copy-button';
import { useExperience } from './experience-context';
import { affordanceMessage } from './formatters';
import type { UnseenLedger } from './session-cues';

export const LedgerDialog = function LedgerDialog({
  ref,
  session,
  unseen,
  onSeen,
  onRestart,
}: {
  ref: React.Ref<HTMLDialogElement>;
  session: ExperienceSession;
  unseen: UnseenLedger;
  onSeen: () => void;
  onRestart: () => Promise<void>;
}) {
  const { story } = useExperience();
  const maxClock = story.limits.maxClock;
  const newInventoryLabels = unseen.inventoryIds.map((id) =>
    story.itemLabel(id),
  );
  const newClueLabels = unseen.clueIds.map((id) => story.clueLabel(id));
  return (
    // Clicking the backdrop targets the dialog element itself; Escape and the
    // close button remain the keyboard equivalents.
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <dialog
      className="ledger-dialog"
      ref={ref}
      aria-labelledby="ledger-title"
      onClose={onSeen}
      onClick={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
    >
      <header>
        <div>
          <p className="eyebrow">Written as it happens</p>
          <h2 id="ledger-title">Adventure ledger</h2>
        </div>
        <form method="dialog">
          <button type="submit" aria-label="Close ledger">
            ×
          </button>
        </form>
      </header>
      <div className="ledger-dialog-content">
        <section className="ledger-section clock-section">
          <div className="section-heading">
            <h2>Midnight clock</h2>
            <span>
              {session.clock} of {maxClock}
            </span>
          </div>
          <div className="clock-track" aria-hidden="true">
            {Array.from({ length: maxClock }, (_, index) => (
              <span
                className={[
                  index < session.clock ? 'filled' : '',
                  unseen.clock === session.clock && index === session.clock - 1
                    ? 'is-new'
                    : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                key={index}
              />
            ))}
          </div>
          <p>
            {session.clock < maxClock
              ? `${maxClock - session.clock} ${maxClock - session.clock === 1 ? 'page remains' : 'pages remain'} before midnight.`
              : 'The sixth bell has sounded.'}
          </p>
        </section>
        <LedgerList
          title="Inventory"
          empty="Your hands are empty."
          items={session.inventoryIds.map((id) => story.itemLabel(id))}
          emphasizedItems={newInventoryLabels}
        />
        <LedgerList
          title="Clues"
          empty="No certain clues yet."
          items={session.clueIds.map((id) => story.clueLabel(id))}
          emphasizedItems={newClueLabels}
        />
        <section className="ledger-section">
          <h2>Attributes</h2>
          <dl className="attribute-list">
            {story.attributes.map((attribute) => (
              <div key={attribute.id}>
                <dt>
                  {attribute.label}
                  {session.character.specialty === attribute.id ? (
                    <small>Strength</small>
                  ) : null}
                </dt>
                <dd>+{session.stats[attribute.id]}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section className="ledger-section">
          <h2>The book&apos;s spells</h2>
          {session.unlockedAbilityIds.length ? (
            <ul className="spell-list">
              {session.unlockedAbilityIds.map((id) => (
                <li
                  className={unseen.abilityIds.includes(id) ? 'is-new' : ''}
                  key={id}
                >
                  <span aria-hidden="true">✦</span>
                  <div>
                    <strong>{story.abilityLabel(id)}</strong>
                    <p>{story.abilityDescription(id)}</p>
                    <small>
                      {session.usedAbilityIds.includes(id)
                        ? 'Used'
                        : `Ready for ${WEBMCP_CLIENT_NAME}`}
                    </small>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-copy">
              Artifacts you recover teach the book new spells.
            </p>
          )}
        </section>
        {!session.pendingResolution && session.phase !== 'COMPLETE' ? (
          <section className="ledger-section next-actions">
            <h2>What the book will resolve</h2>
            <ul>
              {story.getAffordances(session).map((affordance) => (
                <li key={affordance.id}>
                  <div>
                    <strong>{affordance.label}</strong>
                    <p>{affordance.description}</p>
                  </div>
                  <CopyButton
                    className="affordance-copy"
                    text={affordanceMessage(affordance)}
                    idleLabel="Copy"
                  />
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {session.phase !== 'COMPLETE' ? (
          <section className="ledger-section ledger-restart">
            <h2>Start over</h2>
            <RestartButton
              idleLabel="Start a new manuscript"
              onRestart={onRestart}
            />
          </section>
        ) : null}
      </div>
    </dialog>
  );
};

function LedgerList({
  title,
  items,
  empty,
  emphasizedItems = [],
}: {
  title: string;
  items: string[];
  empty: string;
  emphasizedItems?: string[];
}) {
  return (
    <section className="ledger-section">
      <h2>{title}</h2>
      {items.length ? (
        <ul className="token-list">
          {items.map((item) => (
            <li
              className={emphasizedItems.includes(item) ? 'is-new' : ''}
              key={item}
            >
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty-copy">{empty}</p>
      )}
    </section>
  );
}
