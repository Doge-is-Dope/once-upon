'use client';

import { BookOpenTextIcon } from '@phosphor-icons/react/dist/ssr/BookOpenText';
import { useEffect, useRef } from 'react';
import type { PlayerClueEntry } from '@/lib/manuscript/clue-journal';
import type { BookFrameCopy } from '@/lib/runtime/types';

export const CLUES_TITLE_ID = 'story-clues-title';
export const DESK_RAIL_ID = 'desk-rail';

// The notebook page itself: a ruled list of what the reader has noticed.
// It lives inside the desk rail and carries no chrome of its own.
export function StoryClues({
  acknowledgedClueIds,
  available,
  clues,
  copy,
}: {
  acknowledgedClueIds: ReadonlySet<string>;
  /** False until a written chapter exists to take notes from. */
  available: boolean;
  clues: PlayerClueEntry[];
  copy: BookFrameCopy;
}) {
  return (
    <div className="story-clues-sheet">
      <div className="story-clues-sheet-header">
        <h2 id={CLUES_TITLE_ID}>{copy.notes.title}</h2>
      </div>
      {available ? (
        <ol className="story-clues-list">
          {clues.map((clue) => {
            const isNew = !acknowledgedClueIds.has(clue.id);
            return (
              <li className="story-clue-entry" data-new={isNew} key={clue.id}>
                <div className="story-clue-entry-top">
                  <h3>{clue.title}</h3>
                  <span className="story-clue-state">
                    {isNew ? 'New' : 'Noted'}
                  </span>
                </div>
                <p>{clue.observation}</p>
                {clue.lead ? (
                  <div className="story-clue-lead">
                    <span className="story-clue-lead-label">→ Try this</span>
                    <p>{clue.lead}</p>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="story-clues-empty">{copy.notes.empty}</p>
      )}
      {available ? (
        <p className="story-clues-footnote">{copy.notes.footnote}</p>
      ) : null}
    </div>
  );
}

// On desks too narrow for the docked rail the notebook floats beside the
// page and this header key opens it.
export function StoryCluesTrigger({
  hasNewClues,
  onToggle,
  open,
}: {
  hasNewClues: boolean;
  onToggle: () => void;
  open: boolean;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(open);
  useEffect(() => {
    // Focus returns to the key when the notebook closes from within it.
    if (wasOpen.current && !open) {
      const active = document.activeElement;
      const rail = document.getElementById(DESK_RAIL_ID);
      if (!active || active === document.body || rail?.contains(active))
        triggerRef.current?.focus();
    }
    wasOpen.current = open;
  }, [open]);

  return (
    <button
      aria-controls={DESK_RAIL_ID}
      aria-expanded={open}
      aria-label={
        hasNewClues
          ? 'Open clue notebook, new note available'
          : 'Open clue notebook'
      }
      className="story-clues-trigger"
      data-new={hasNewClues || undefined}
      onClick={onToggle}
      ref={triggerRef}
      type="button"
    >
      <BookOpenTextIcon aria-hidden="true" size={18} weight="regular" />
      <span className="story-clues-trigger-label">Notes</span>
      {hasNewClues ? <span className="story-clues-new-label">New</span> : null}
    </button>
  );
}
