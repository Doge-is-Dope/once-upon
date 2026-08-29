'use client';

import { useState } from 'react';
import type { TurnResolution } from '@/lib/runtime/types';
import { MarginNotes } from '../book-leaf-page';
import { BookSurface } from '../manuscript-book';
import { formatPageNumber } from '../model';
import { RollCard } from '../roll-card';

export function StoryPreview() {
  const [page, setPage] = useState(0);
  return (
    <aside className="preview-book" aria-label="Sample manuscript">
      <p className="preview-label">Sample leaves</p>
      <div className="book-spread preview-spread">
        <BookSurface side="left">
          {page === 0 ? (
            <div className="bookplate-copy">
              <span className="bookplate-mark">M</span>
              <p>This manuscript belongs to</p>
              <h2>The traveler</h2>
              <small>Six pages before midnight</small>
            </div>
          ) : (
            <PreviewStoryPage turn={1} />
          )}
        </BookSurface>
        <BookSurface side="right">
          {page === 0 ? (
            <div className="leaf-copy">
              <p className="entry-number">Prologue</p>
              <h2>The tavern before dawn</h2>
              <p className="manuscript-prose">
                The traveler woke beside a dying hearth. A raven watched from
                the rafters while something beneath the floor answered the
                clock.
              </p>
            </div>
          ) : (
            <div className="unwritten-copy" aria-label="Unwritten sample page">
              <span aria-hidden="true">Ⅱ</span>
              <p>This page has not been written yet.</p>
            </div>
          )}
        </BookSurface>
      </div>
      <nav className="book-navigation" aria-label="Sample page navigation">
        <button
          type="button"
          disabled={page === 0}
          onClick={() => setPage(0)}
          aria-label="Previous sample pages"
        >
          ←
        </button>
        <span>{page + 1} / 2</span>
        <button
          type="button"
          disabled={page === 1}
          onClick={() => setPage(1)}
          aria-label="Next sample pages"
        >
          →
        </button>
      </nav>
    </aside>
  );
}

function PreviewStoryPage({ turn }: { turn: number }) {
  const resolution = sampleResolution();
  return (
    <div className="leaf-copy">
      <p className="entry-number">Page {formatPageNumber(turn)}</p>
      <h2>A key in the ashes</h2>
      <p className="manuscript-prose">
        The traveler sifted the cold hearth. Beneath the ash, a blackened key
        still held the warmth of a hand that had vanished years ago.
      </p>
      <RollCard resolution={resolution} settle />
      <MarginNotes
        events={[
          {
            id: 'sample-key',
            type: 'item',
            label: 'Charred Key',
            detail: 'A warm key surfaced from beneath the hearth.',
          },
        ]}
      />
    </div>
  );
}

// A hand-written fixture that renders the sample page; it never touches a
// real session.
function sampleResolution(): TurnResolution {
  return {
    resolutionId: 'sample',
    actionId: 'search_hearth',
    intent: 'Search the hearth',
    turn: 1,
    createdAt: 0,
    roll: {
      die: 14,
      attribute: 'wits',
      modifier: 2,
      total: 16,
      dc: 13,
      tier: 'success',
    },
    canonicalEvents: [],
    representedEventIds: [],
    mustInclude: [],
    mustNotClaim: [],
    newAbilityIds: [],
  };
}
