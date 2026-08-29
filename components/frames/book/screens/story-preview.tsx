'use client';

import { useState } from 'react';
import { MarginNotes } from '../book-leaf-page';
import { useBookFrameCopy } from '../experience-context';
import { titleCase } from '../formatters';
import { BookSurface } from '../manuscript-book';
import { formatPageNumber } from '../model';
import { RollCard } from '../roll-card';

export function StoryPreview() {
  const copy = useBookFrameCopy();
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
              <h2>{titleCase(copy.defaultProtagonist)}</h2>
              <small>{copy.tagline}</small>
            </div>
          ) : (
            <PreviewStoryPage turn={1} />
          )}
        </BookSurface>
        <BookSurface side="right">
          {page === 0 ? (
            <div className="leaf-copy">
              <p className="entry-number">Prologue</p>
              <h2>{copy.prologueTitle}</h2>
              <p className="manuscript-prose">{copy.preview.prologueText}</p>
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
  const copy = useBookFrameCopy();
  return (
    <div className="leaf-copy">
      <p className="entry-number">Page {formatPageNumber(turn)}</p>
      <h2>{copy.preview.sampleTitle}</h2>
      <p className="manuscript-prose">{copy.preview.sampleProse}</p>
      <RollCard resolution={copy.preview.sampleResolution} settle />
      <MarginNotes events={[copy.preview.sampleEvent]} />
    </div>
  );
}
