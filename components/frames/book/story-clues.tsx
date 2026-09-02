'use client';

/* oxlint-disable jsx-a11y/no-noninteractive-tabindex -- The scrollable clue journal needs a focus target so keyboard users can enter and scroll it. */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDialogElement>(null);
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

  useLayoutEffect(() => {
    const popover = popoverRef.current;
    if (!popover) return;
    if (open) {
      if (!popover.matches(':popover-open')) popover.showPopover();
      sheetRef.current?.focus({ preventScroll: true });
      return;
    }
    if (popover.matches(':popover-open')) popover.hidePopover();
  }, [open]);

  const acknowledgeVisibleClues = useCallback(() => {
    setAcknowledgedClueIds(
      (current) => new Set([...current, ...clues.map(({ id }) => id)]),
    );
  }, [clues]);

  const close = useCallback(
    ({ restoreFocus = true }: { restoreFocus?: boolean } = {}) => {
      acknowledgeVisibleClues();
      onOpenChange(false);
      if (restoreFocus)
        requestAnimationFrame(() => triggerRef.current?.focus());
    },
    [acknowledgeVisibleClues, onOpenChange],
  );

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      close();
    };
    const handleFocusIn = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (
        popoverRef.current?.contains(target) ||
        triggerRef.current?.contains(target)
      )
        return;
      close({ restoreFocus: false });
    };
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('focusin', handleFocusIn);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('focusin', handleFocusIn);
    };
  }, [close, open]);

  return (
    <div className="story-clues-control">
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
          if (open) close({ restoreFocus: false });
          else {
            onOpenChange(true);
            onAnnounce(`Notes opened. ${clues.length} found.`);
          }
        }}
        ref={triggerRef}
        type="button"
      >
        <span aria-hidden="true" className="story-clues-cover-stitches" />
        <span className="story-clues-trigger-label">Notes</span>
        <span aria-hidden="true" className="story-clues-cover-corner" />
      </button>
      <div
        className="story-clues-popover"
        id={CLUES_POPOVER_ID}
        onPointerDown={(event) => {
          if (event.target === event.currentTarget) close();
        }}
        popover="manual"
        ref={popoverRef}
      >
        <dialog
          aria-describedby={CLUES_DESCRIPTION_ID}
          aria-labelledby={CLUES_TITLE_ID}
          className="story-clues-sheet"
          open
          ref={sheetRef}
          tabIndex={0}
        >
          <p className="sr-only" id={CLUES_DESCRIPTION_ID}>
            Press Escape or click outside the page to close this journal.
          </p>
          <div aria-hidden="true" className="story-clues-binding" />
          <div className="story-clues-sheet-header">
            <p className="story-clues-eyebrow">
              Notes from the room · {clues.length} found
            </p>
            <h2 id={CLUES_TITLE_ID}>Things I noticed</h2>
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
        </dialog>
      </div>
    </div>
  );
}
