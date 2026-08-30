'use client';

import { useEffect, useRef, useState } from 'react';
import type { ExperienceSession } from '@/lib/runtime/types';
import { BookLeafPage } from './book-leaf-page';
import { useBookFrameCopy, useExperience } from './experience-context';
import {
  buildBookLeaves,
  formatPageNumber,
  latestBookLeafIndex,
  type BookLeaf,
} from './model';
import { EMPTY_MOTION_CUES, type MotionCues } from './session-cues';
import { usePageTurning } from './use-page-turning';

export function ManuscriptBook({
  session,
  recoveryReady,
  streamingEntryId,
  motionCues,
  focusReaderToken,
  onStreamed,
  onConsumeMotion,
  onRestart,
}: {
  session: ExperienceSession;
  recoveryReady: boolean;
  streamingEntryId: string | null;
  motionCues: MotionCues;
  focusReaderToken: number;
  onStreamed: () => void;
  onConsumeMotion: () => void;
  onRestart: () => Promise<void>;
}) {
  const { story } = useExperience();
  const copy = useBookFrameCopy();
  const leaves = buildBookLeaves(session, story.limits.maxTurns, copy);
  const latestLeaf = latestBookLeafIndex(session, story.limits.maxTurns);
  const singlePage = useSinglePage();
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const {
    activeLeaf,
    unit,
    maxUnit,
    visibleIndices,
    turnOverlay,
    newPageReady,
    readerRef,
    spreadRef,
    turnTo,
    move,
    clearOverlay,
  } = usePageTurning({
    latestLeaf,
    singlePage,
    focusReaderToken,
    onConsumeMotion,
  });

  return (
    <section className="book-reader-shell" aria-label="Manuscript reader">
      {newPageReady ? (
        <button
          className="new-page-bookmark"
          type="button"
          onClick={() => {
            turnTo(latestLeaf, 'forward');
            readerRef.current?.focus();
          }}
        >
          New page ready
        </button>
      ) : null}
      {/* This composite reader deliberately takes focus for arrow-key paging. */}
      {/* oxlint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */}
      <section
        className="book-reader"
        aria-label="Book pages. Use left and right arrow keys to turn pages."
        tabIndex={0}
        ref={readerRef}
        onKeyDown={(event) => {
          if (isInteractiveTarget(event.target)) return;
          if (event.key === 'ArrowLeft') {
            event.preventDefault();
            move(-1);
          }
          if (event.key === 'ArrowRight') {
            event.preventDefault();
            move(1);
          }
        }}
        onPointerDown={(event) => {
          if (
            (event.pointerType !== 'touch' && event.pointerType !== 'pen') ||
            isInteractiveTarget(event.target) ||
            event.clientX < 24 ||
            event.clientX > window.innerWidth - 24
          ) {
            pointerStart.current = null;
            return;
          }
          pointerStart.current = { x: event.clientX, y: event.clientY };
        }}
        onPointerUp={(event) => {
          const start = pointerStart.current;
          pointerStart.current = null;
          if (!start) return;
          const dx = event.clientX - start.x;
          const dy = event.clientY - start.y;
          if (Math.abs(dx) >= 56 && Math.abs(dx) > Math.abs(dy) * 1.4)
            move(dx < 0 ? 1 : -1);
        }}
      >
        <div
          className="book-spread"
          data-layout={singlePage ? 'single' : 'spread'}
          ref={spreadRef}
        >
          {visibleIndices.map((index, position) => (
            <BookSurface
              key={`${leaves[index].key}-${index}`}
              side={singlePage ? 'single' : position === 0 ? 'left' : 'right'}
            >
              <BookLeafPage
                leaf={leaves[index]}
                session={session}
                recoveryReady={recoveryReady}
                streamingEntryId={streamingEntryId}
                motionCues={motionCues}
                isLatest={index === latestLeaf}
                onReadBeginning={() => turnTo(0, 'back')}
                onStreamed={onStreamed}
                onRestart={onRestart}
              />
            </BookSurface>
          ))}
          {turnOverlay ? (
            <div
              className={`page-turn-overlay ${turnOverlay.direction}`}
              aria-hidden="true"
              inert
              onAnimationEnd={(event) => {
                if (event.animationName.startsWith('turn-page')) clearOverlay();
              }}
            >
              {turnOverlay.indices.map((index, position) => {
                const isTurningLeaf =
                  singlePage ||
                  (turnOverlay.direction === 'forward'
                    ? position === 1
                    : position === 0);
                return (
                  <BookSurface
                    key={`overlay-${leaves[index].key}-${index}`}
                    side={
                      singlePage ? 'single' : position === 0 ? 'left' : 'right'
                    }
                  >
                    {/* The turning sheet is real paper: the outgoing page on
                        the front, the destination page on the back, so it
                        lands seamlessly on the spread beneath. */}
                    <div className="overlay-face front">
                      <BookLeafPage
                        leaf={leaves[index]}
                        session={session}
                        recoveryReady={false}
                        streamingEntryId={null}
                        motionCues={EMPTY_MOTION_CUES}
                        isLatest={index === latestLeaf}
                        onReadBeginning={() => {}}
                        onStreamed={() => {}}
                        onRestart={onRestart}
                      />
                    </div>
                    <div className="overlay-face back">
                      {isTurningLeaf ? (
                        <BookLeafPage
                          leaf={leaves[turnOverlay.backIndex]}
                          session={session}
                          recoveryReady={false}
                          streamingEntryId={null}
                          motionCues={EMPTY_MOTION_CUES}
                          isLatest={turnOverlay.backIndex === latestLeaf}
                          onReadBeginning={() => {}}
                          onStreamed={() => {}}
                          onRestart={onRestart}
                        />
                      ) : null}
                    </div>
                  </BookSurface>
                );
              })}
            </div>
          ) : null}
        </div>
      </section>
      {/* oxlint-enable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */}
      <nav className="book-navigation" aria-label="Manuscript page navigation">
        <button
          type="button"
          disabled={unit <= 0}
          onClick={() => move(-1)}
          aria-label={singlePage ? 'Previous page' : 'Previous pages'}
        >
          ←
        </button>
        <span>
          {singlePage
            ? leafNavigationLabel(leaves[activeLeaf])
            : spreadNavigationLabel(leaves, visibleIndices)}
        </span>
        <button
          type="button"
          disabled={unit >= maxUnit}
          onClick={() => move(1)}
          aria-label={singlePage ? 'Next page' : 'Next pages'}
        >
          →
        </button>
      </nav>
    </section>
  );
}

export function BookSurface({
  side,
  children,
}: {
  side: 'left' | 'right' | 'single';
  children: React.ReactNode;
}) {
  return <article className={`book-leaf ${side}`}>{children}</article>;
}

// Must stay in sync with the single-page breakpoint in styles/reader.css.
export const BOOK_SINGLE_PAGE_MEDIA_QUERY = '(max-width: 900px)';

function useSinglePage(): boolean {
  const [singlePage, setSinglePage] = useState(
    () => window.matchMedia(BOOK_SINGLE_PAGE_MEDIA_QUERY).matches,
  );
  useEffect(() => {
    const query = window.matchMedia(BOOK_SINGLE_PAGE_MEDIA_QUERY);
    const update = () => setSinglePage(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return singlePage;
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    Boolean(
      target.closest(
        'button, a, input, textarea, select, summary, details, dialog',
      ),
    )
  );
}

function leafNavigationLabel(leaf: BookLeaf): string {
  if (leaf.kind === 'bookplate') return 'Bookplate';
  if (leaf.kind === 'prologue') return 'Prologue';
  return `${leaf.kind === 'draft' ? 'Draft ' : ''}Page ${formatPageNumber(leaf.turn!)}`;
}

function spreadNavigationLabel(
  leaves: BookLeaf[],
  visibleIndices: number[],
): string {
  const visibleLeaves = visibleIndices.map((index) => leaves[index]);
  if (visibleLeaves[0]?.kind === 'bookplate') return 'Bookplate · Prologue';
  const turns = visibleLeaves
    .map((leaf) => leaf.turn)
    .filter((turn): turn is number => turn !== null && turn > 0);
  if (!turns.length) return 'Manuscript pages';
  if (turns.length === 1) return `Page ${formatPageNumber(turns[0])}`;
  return `Pages ${formatPageNumber(turns[0])}–${formatPageNumber(turns.at(-1)!)}`;
}
