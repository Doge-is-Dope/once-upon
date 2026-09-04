'use client';

import { BookOpenTextIcon } from '@phosphor-icons/react/dist/ssr/BookOpenText';
import { useEffect, useId, useRef } from 'react';
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
                    <p>{clue.lead}</p>
                    <ClueRing />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : null}
    </div>
  );
}

// A red-pen ring around the thing worth trying. The stroke is a filled
// shape whose width follows pen pressure (light start, fuller through the
// turn, lifting at the end, a little past where it began); a stroked copy
// of its centreline masks it so it is drawn on along the path.
const RING_OUTLINE =
  'M9.1 25.7 L11.9 23.6 L14.9 21.4 L18.2 19.3 L22.2 17.3 L27.2 15.4 L33.0 13.8 L39.4 12.4 L46.0 11.0 L52.4 9.7 L58.9 8.4 L65.7 7.2 L73.1 6.3 L80.8 5.9 L88.7 6.1 L96.4 6.6 L103.8 7.2 L110.9 7.8 L118.1 8.0 L125.6 8.2 L133.3 8.4 L141.0 8.9 L148.3 9.7 L155.2 10.9 L161.7 12.2 L167.9 13.7 L173.9 15.3 L179.3 17.1 L183.5 19.0 L186.3 21.2 L187.7 23.3 L188.3 25.6 L188.7 27.9 L189.5 30.2 L190.6 32.4 L191.3 34.6 L191.0 36.5 L189.2 38.4 L185.6 40.3 L180.8 42.0 L175.5 43.6 L170.5 45.1 L165.8 46.6 L161.3 48.2 L156.5 49.7 L151.1 51.1 L145.2 52.3 L138.9 53.5 L132.4 54.6 L125.6 55.8 L118.4 56.9 L110.7 57.7 L102.6 58.1 L94.4 58.0 L86.5 57.3 L79.0 56.4 L71.9 55.4 L64.8 54.5 L57.7 53.7 L50.5 52.8 L43.7 51.7 L37.7 50.4 L32.8 48.7 L28.9 46.8 L25.5 44.9 L22.4 43.1 L19.4 41.2 L16.9 39.3 L15.2 37.4 L14.4 35.5 L14.2 33.5 L14.1 31.4 L13.6 29.2 L12.6 27.0 L11.5 24.7 L11.1 22.3 L12.3 19.9 L15.5 17.7 L20.5 15.7 L26.6 14.0 L32.9 12.4 L39.2 10.9 L45.5 9.3 L52.0 7.8 L59.0 6.5 L59.0 6.1 L51.9 7.4 L45.4 8.9 L39.1 10.5 L32.8 12.0 L26.5 13.6 L20.4 15.4 L15.4 17.4 L12.0 19.7 L10.7 22.2 L11.1 24.8 L12.1 27.2 L13.0 29.4 L13.4 31.5 L13.4 33.6 L13.5 35.7 L14.4 37.9 L16.2 40.1 L18.8 42.1 L21.8 44.0 L24.9 45.9 L28.3 47.8 L32.4 49.7 L37.4 51.3 L43.5 52.7 L50.4 53.7 L57.6 54.5 L64.7 55.3 L71.8 56.2 L78.9 57.2 L86.4 58.2 L94.3 58.9 L102.6 59.1 L110.8 58.8 L118.6 58.1 L125.8 57.1 L132.6 56.0 L139.2 54.9 L145.5 53.8 L151.5 52.6 L156.9 51.2 L161.8 49.7 L166.4 48.1 L171.0 46.5 L176.0 45.0 L181.2 43.3 L186.1 41.5 L189.9 39.4 L192.0 37.0 L192.4 34.4 L191.6 32.0 L190.5 29.8 L189.8 27.6 L189.4 25.4 L188.8 22.9 L187.3 20.3 L184.2 17.9 L179.8 15.7 L174.3 13.8 L168.3 12.2 L162.0 10.6 L155.5 9.3 L148.5 8.1 L141.1 7.3 L133.4 6.9 L125.6 6.7 L118.2 6.7 L111.0 6.5 L103.9 6.1 L96.5 5.6 L88.8 5.2 L80.8 5.1 L73.0 5.5 L65.6 6.4 L58.8 7.6 L52.3 8.9 L45.8 10.2 L39.3 11.4 L32.8 12.8 L26.9 14.4 L21.8 16.3 L17.7 18.4 L14.2 20.5 L11.2 22.7 L8.5 24.9 Z';
const RING_CENTRE =
  'M8.8 25.3 L11.5 23.1 L14.6 21.0 L17.9 18.8 L22.0 16.8 L27.0 14.9 L32.9 13.3 L39.4 11.9 L45.9 10.6 L52.4 9.3 L58.9 8.0 L65.7 6.8 L73.0 5.9 L80.8 5.5 L88.8 5.6 L96.5 6.1 L103.8 6.7 L111.0 7.1 L118.1 7.4 L125.6 7.5 L133.3 7.6 L141.0 8.1 L148.4 8.9 L155.3 10.1 L161.9 11.4 L168.1 12.9 L174.1 14.6 L179.5 16.4 L183.9 18.5 L186.8 20.7 L188.3 23.1 L188.9 25.5 L189.3 27.8 L190.0 30.0 L191.1 32.2 L191.8 34.5 L191.5 36.8 L189.5 38.9 L185.8 40.9 L181.0 42.7 L175.8 44.3 L170.7 45.8 L166.1 47.4 L161.6 48.9 L156.7 50.5 L151.3 51.8 L145.4 53.1 L139.0 54.2 L132.5 55.3 L125.7 56.4 L118.5 57.5 L110.8 58.3 L102.6 58.6 L94.4 58.4 L86.4 57.8 L78.9 56.8 L71.8 55.8 L64.8 54.9 L57.6 54.1 L50.4 53.3 L43.6 52.2 L37.5 50.8 L32.6 49.2 L28.6 47.3 L25.2 45.4 L22.1 43.5 L19.1 41.6 L16.5 39.7 L14.8 37.7 L13.9 35.6 L13.8 33.5 L13.7 31.5 L13.3 29.3 L12.4 27.1 L11.3 24.7 L10.9 22.3 L12.2 19.8 L15.4 17.5 L20.5 15.6 L26.5 13.8 L32.9 12.2 L39.1 10.7 L45.4 9.1 L52.0 7.6 L59.0 6.3';

function ClueRing() {
  const maskId = useId();
  return (
    <svg
      aria-hidden="true"
      className="story-clue-circle"
      preserveAspectRatio="none"
      viewBox="0 0 200 64"
    >
      <mask id={maskId} maskUnits="userSpaceOnUse">
        <path
          className="story-clue-circle-reveal"
          d={RING_CENTRE}
          pathLength={1}
        />
      </mask>
      <path className="story-clue-circle-ink" d={RING_OUTLINE} mask={`url(#${maskId})`} />
    </svg>
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
