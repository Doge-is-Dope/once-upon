'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

type PaginationMetrics = {
  pager: HTMLDivElement;
  gap: number;
  width: number;
  stride: number;
  count: number;
  current: number;
};

function paginationMetrics(pager: HTMLDivElement): PaginationMetrics | null {
  // Fractional width, to match the used column width the `cqi`-based
  // stylesheet resolves; integer clientWidth drifts off the real stride
  // by up to half a pixel per page.
  const width = pager.getBoundingClientRect().width;
  if (width === 0) return null;
  const pagerStyle = getComputedStyle(pager);
  const gapRem = Number.parseFloat(
    pagerStyle.getPropertyValue('--page-gap-rem'),
  );
  const rootFontSize = Number.parseFloat(
    getComputedStyle(document.documentElement).fontSize,
  );
  if (!Number.isFinite(gapRem) || !Number.isFinite(rootFontSize)) return null;
  const gap = gapRem * rootFontSize;
  const stride = width + gap;
  return {
    pager,
    gap,
    width,
    stride,
    count: Math.max(1, Math.round((pager.scrollWidth + gap) / stride)),
    current: Math.round(pager.scrollLeft / stride),
  };
}

/**
 * Paginates the fixed-size sheet. The pager is a hidden-scrollbar scroll
 * container whose content flows through CSS columns sized to the pager's
 * width, so one column equals one page of the typed record.
 *
 * Page turns shuffle sheets sideways across the desk, not a carousel:
 * 'swap' fade-glides the current sheet aside along the reading
 * direction, jumps the scroll position while nothing is visible, then
 * settles the next sheet in from the opposite side. 'slide' is the
 * short corrective scroll after a manual swipe; 'jump' is immediate.
 */
export function usePagination({
  navigationEnabled = true,
}: {
  navigationEnabled?: boolean;
} = {}): {
  pagerRef: RefObject<HTMLDivElement | null>;
  page: number;
  pageCount: number;
  goToPage: (target: number, mode?: 'swap' | 'slide' | 'jump') => void;
  goToLastPage: () => void;
  goToPrevious: () => void;
  goToNext: () => void;
  getCurrentPage: () => number;
  pageAt: (element: Element) => number;
  reflowTo: (anchor: Element | null, mode?: 'swap' | 'jump') => void;
  measure: () => { count: number };
} {
  const pagerRef = useRef<HTMLDivElement | null>(null);
  const [page, setPage] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const targetPageRef = useRef(0);
  const rollCleanup = useRef<(() => void) | null>(null);

  const metrics = useCallback(() => {
    const pager = pagerRef.current;
    return pager ? paginationMetrics(pager) : null;
  }, []);

  const measure = useCallback(() => {
    // The column flow and snap rails size themselves with `cqi` units, so
    // measuring never has to write styles back — just refresh the count.
    const m = metrics();
    if (!m) return { count: 1 };
    setPageCount(m.count);
    return { count: m.count };
  }, [metrics]);

  const getCurrentPage = useCallback(() => {
    const m = metrics();
    if (!m) return 0;
    return m.current;
  }, [metrics]);

  const pageAt = useCallback(
    (element: Element) => {
      const m = metrics();
      if (!m) return 0;
      const left =
        element.getBoundingClientRect().left -
        m.pager.getBoundingClientRect().left +
        m.pager.scrollLeft;
      // floor, not round: an element sitting in the right half of a page
      // is still ON that page. Rounding here made the typing follower
      // turn one page ahead and then fight its way back. The +1px
      // absorbs sub-pixel jitter for elements exactly on a page start.
      return Math.max(0, Math.floor((left + 1) / m.stride));
    },
    [metrics],
  );

  const clearRoll = useCallback((pager: HTMLElement) => {
    rollCleanup.current?.();
    rollCleanup.current = null;
    pager.classList.remove(
      'is-turning-out-forward',
      'is-turning-out-back',
      'is-turning-in-forward',
      'is-turning-in-back',
    );
  }, []);

  const goToPage = useCallback(
    (target: number, mode: 'swap' | 'slide' | 'jump' = 'swap') => {
      const m = metrics();
      if (!m) return;
      const next = Math.min(Math.max(target, 0), m.count - 1);
      const left = next * m.stride;
      targetPageRef.current = next;
      setPage(next);
      // A new navigation intent supersedes any unfinished paper-roll timers,
      // including when the sheet has not moved to the previous target yet.
      clearRoll(m.pager);
      if (Math.abs(m.pager.scrollLeft - left) < 1) return;
      const reduced = window.matchMedia(
        '(prefers-reduced-motion: reduce)',
      ).matches;
      if (mode === 'jump' || (mode === 'swap' && reduced)) {
        m.pager.scrollTo({ left });
        return;
      }
      if (mode === 'slide') {
        m.pager.scrollTo({ left, behavior: reduced ? 'auto' : 'smooth' });
        return;
      }
      const pager = m.pager;
      const forward = left > pager.scrollLeft;
      const inClass = forward ? 'is-turning-in-forward' : 'is-turning-in-back';
      pager.classList.add(
        forward ? 'is-turning-out-forward' : 'is-turning-out-back',
      );
      // The choreography rides the animations themselves: the scroll
      // position jumps when the exit finishes and the turn clears when
      // the entry finishes, so CSS owns the durations. One safety timer
      // covers environments where the animations never run.
      const onAnimationEnd = (event: AnimationEvent) => {
        if (event.target !== pager) return;
        if (event.animationName.startsWith('page-exit')) {
          pager.scrollTo({ left });
          pager.classList.remove(
            'is-turning-out-forward',
            'is-turning-out-back',
          );
          pager.classList.add(inClass);
          return;
        }
        if (event.animationName.startsWith('page-enter')) clearRoll(pager);
      };
      const safety = window.setTimeout(() => {
        pager.scrollTo({ left });
        clearRoll(pager);
      }, 1500);
      pager.addEventListener('animationend', onAnimationEnd);
      rollCleanup.current = () => {
        pager.removeEventListener('animationend', onAnimationEnd);
        window.clearTimeout(safety);
      };
    },
    [clearRoll, metrics],
  );

  const goToLastPage = useCallback(
    () => goToPage(Number.MAX_SAFE_INTEGER),
    [goToPage],
  );
  const goToPrevious = useCallback(() => {
    if (navigationEnabled) goToPage(targetPageRef.current - 1);
  }, [goToPage, navigationEnabled]);
  const goToNext = useCallback(() => {
    if (navigationEnabled) goToPage(targetPageRef.current + 1);
  }, [goToPage, navigationEnabled]);
  const reflowTo = useCallback(
    (anchor: Element | null, mode: 'swap' | 'jump' = 'jump') => {
      const { count } = measure();
      const target = anchor
        ? pageAt(anchor)
        : Math.min(targetPageRef.current, count - 1);
      goToPage(Math.min(target, count - 1), mode);
    },
    [goToPage, measure, pageAt],
  );

  // Track scroll position (touch swipes, browser auto-scrolls). Settling
  // on a whole page is CSS scroll snap's job — no JS correction here, so
  // free gestures are never fought mid-flight.
  useEffect(() => {
    const pager = pagerRef.current;
    if (!pager) return;

    const onScroll = () => {
      const m = metrics();
      if (m) {
        targetPageRef.current = m.current;
        setPage(m.current);
      }
    };

    pager.addEventListener('scroll', onScroll, { passive: true });
    return () => pager.removeEventListener('scroll', onScroll);
  }, [metrics]);

  // Re-measure when the pager resizes on either axis or the webfonts
  // finish loading. A height change (mobile URL bar, on-screen keyboard,
  // rotation, window resize) re-fragments every column, so the realign
  // anchors on the first flow block at or after the reader's current
  // page and restores the reading position, not the stale page index.
  useEffect(() => {
    const pager = pagerRef.current;
    if (!pager) return;
    let lastInline = -1;
    let lastBlock = -1;
    let frame = 0;
    const realign = () => {
      const m = metrics();
      if (!m) return;
      let anchor: Element | null = null;
      const flow = m.pager.querySelector('.sheet-flow');
      if (flow) {
        for (const child of flow.children) {
          if (pageAt(child) >= m.current) {
            anchor = child;
            break;
          }
        }
      }
      reflowTo(anchor, 'jump');
    };
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentBoxSize?.[0];
      const inline = box?.inlineSize ?? pager.clientWidth;
      const block = box?.blockSize ?? pager.clientHeight;
      if (inline === lastInline && block === lastBlock) return;
      const initial = lastInline < 0;
      lastInline = inline;
      lastBlock = block;
      if (initial) return;
      // Mobile browser chrome resizes arrive in bursts; realign once.
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(realign);
    });
    observer.observe(pager);
    // Font swap changes the column fill (scrollWidth, not the pager box),
    // so always remeasure; goToPage bails out if already aligned.
    document.fonts?.ready.then(() => realign()).catch(() => {});
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [metrics, pageAt, reflowTo]);

  // Arrow keys flip pages unless focus is in a text field.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!navigationEnabled) return;
      if (event.defaultPrevented || event.metaKey || event.ctrlKey) return;
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.isContentEditable ||
          ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
      )
        return;
      event.preventDefault();
      goToPage(targetPageRef.current + (event.key === 'ArrowLeft' ? -1 : 1));
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [goToPage, navigationEnabled]);

  return {
    pagerRef,
    page,
    pageCount,
    goToPage,
    goToLastPage,
    goToPrevious,
    goToNext,
    getCurrentPage,
    pageAt,
    reflowTo,
    measure,
  };
}
