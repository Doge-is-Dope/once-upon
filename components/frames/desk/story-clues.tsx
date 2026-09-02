'use client';

/* oxlint-disable jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- The native modal handles Escape; this click handler only dismisses its visual backdrop. */

import { BookOpenTextIcon } from '@phosphor-icons/react/dist/ssr/BookOpenText';
import { XIcon } from '@phosphor-icons/react/dist/ssr/X';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { derivePlayerClues } from '@/lib/manuscript/clue-journal';
import type {
  ExperienceDefinition,
  ExperienceSession,
} from '@/lib/runtime/types';

const CLUES_POPOVER_ID = 'story-clues-popover';
const CLUES_TITLE_ID = 'story-clues-title';
const CLUES_DESCRIPTION_ID = 'story-clues-description';

export function StoryClues({
  experience,
  onAnnounce,
  onOpenChange,
  open,
  session,
}: {
  experience: ExperienceDefinition;
  onAnnounce: (message: string) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  session: ExperienceSession;
}) {
  const clues = useMemo(
    () => derivePlayerClues(experience, session),
    [experience, session],
  );
  const prologueClueIds = useMemo(
    () =>
      new Set(
        experience.story.clues
          .filter(({ revealedBy }) => revealedBy.kind === 'prologue')
          .map(({ id }) => id),
      ),
    [experience],
  );
  const [acknowledgedClueIds, setAcknowledgedClueIds] = useState<
    ReadonlySet<string>
  >(() => prologueClueIds);
  const hasNewClues = clues.some(({ id }) => !acknowledgedClueIds.has(id));
  const dialogRef = useRef<HTMLDialogElement>(null);
  const previousClues = useRef({
    sessionId: session.sessionId,
    ids: new Set(clues.map(({ id }) => id)),
  });

  useEffect(() => {
    const previous = previousClues.current;
    const currentIds = new Set(clues.map(({ id }) => id));
    if (previous.sessionId !== session.sessionId) {
      previousClues.current = { sessionId: session.sessionId, ids: currentIds };
      return;
    }
    const added = clues.filter(({ id }) => !previous.ids.has(id));
    previousClues.current = { sessionId: session.sessionId, ids: currentIds };
    if (added.length === 1) onAnnounce(`New clue: ${added[0]!.title}.`);
    if (added.length > 1)
      onAnnounce(`New clues: ${added.map(({ title }) => title).join(', ')}.`);
  }, [clues, onAnnounce, session.sessionId]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      if (!dialog.open) dialog.showModal();
      return;
    }
    if (dialog.open) dialog.close();
  }, [open]);

  const acknowledgeVisibleClues = useCallback(() => {
    setAcknowledgedClueIds(
      (current) => new Set([...current, ...clues.map(({ id }) => id)]),
    );
  }, [clues]);

  const close = useCallback(() => {
    acknowledgeVisibleClues();
    onOpenChange(false);
  }, [acknowledgeVisibleClues, onOpenChange]);

  return (
    <div
      className="story-clues-control"
      data-new={hasNewClues || undefined}
      data-open={open || undefined}
    >
      <button
        aria-label={
          hasNewClues
            ? 'Open clue notebook, new note available'
            : 'Open clue notebook'
        }
        aria-controls={CLUES_POPOVER_ID}
        aria-expanded={open}
        className="story-clues-trigger"
        data-new={hasNewClues || undefined}
        onClick={() => {
          if (open) close();
          else {
            onOpenChange(true);
            onAnnounce(`Notes opened. ${clues.length} found.`);
          }
        }}
        type="button"
      >
        <BookOpenTextIcon aria-hidden="true" size={18} weight="regular" />
        <span className="story-clues-trigger-label">Notes</span>
        {hasNewClues ? (
          <span className="story-clues-new-label">New</span>
        ) : null}
      </button>
      <dialog
        aria-describedby={CLUES_DESCRIPTION_ID}
        aria-labelledby={CLUES_TITLE_ID}
        className="story-clues-popover"
        id={CLUES_POPOVER_ID}
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
        onClose={() => {
          acknowledgeVisibleClues();
          if (open) onOpenChange(false);
        }}
        ref={dialogRef}
      >
        <div className="story-clues-sheet">
          <p className="sr-only" id={CLUES_DESCRIPTION_ID}>
            Press Escape or click outside the page to close this journal.
          </p>
          <div aria-hidden="true" className="story-clues-binding" />
          <div className="story-clues-sheet-header">
            <div>
              <p className="story-clues-eyebrow">
                Notes from the room · {clues.length} found
              </p>
              <h2 id={CLUES_TITLE_ID}>Things I noticed</h2>
            </div>
            <button
              aria-label="Close notes"
              className="story-clues-close"
              onClick={close}
              type="button"
            >
              <XIcon aria-hidden="true" size={18} />
            </button>
          </div>
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
          <p className="story-clues-footnote">
            Only what I have noticed so far.
          </p>
        </div>
      </dialog>
    </div>
  );
}
