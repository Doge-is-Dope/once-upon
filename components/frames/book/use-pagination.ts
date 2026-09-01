'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

const PAGE_GAP_REM = 6;

/**
 * Paginates the fixed-size sheet. The pager is a hidden-scrollbar scroll
 * container whose content flows through CSS columns sized to the pager's
 * width, so one column equals one page of the typed record.
 *
 * Page turns behave like paper through a platen, not a carousel: 'swap'
 * rolls the current sheet up (or down) out of the machine, jumps the
 * scroll position while nothing is visible, then feeds the next sheet in
 * with a stepped, line-by-line ratchet. 'slide' is the short corrective
 * scroll after a manual swipe; 'jump' is immediate.
 */
export function usePagination(): {
  pagerRef: RefObject<HTMLDivElement | null>;
  page: number;
  pageCount: number;
  goToPage: (target: number, mode?: 'swap' | 'slide' | 'jump') => void;
  goToLastPage: () => void;
  goToPrevious: () => void;
  goToNext: () => void;
  getCurrentPage: () => number;
  pageAt: (element: Element) => number;
  measure: () => { count: number };
} {
  const pagerRef = useRef<HTMLDivElement | null>(null);
  const [page, setPage] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const targetPageRef = useRef(0);
  const rollTimeouts = useRef<number[]>([]);

  const metrics = useCallback(() => {
    const pager = pagerRef.current;
    if (!pager || pager.clientWidth === 0) return null;
    const rootFontSize = parseFloat(
      getComputedStyle(document.documentElement).fontSize,
    );
    const gap = PAGE_GAP_REM * rootFontSize;
    const width = pager.clientWidth;
    return { pager, gap, width, stride: width + gap };
  }, []);

  const measure = useCallback(() => {
    const m = metrics();
    if (!m) return { count: 1 };
    // Set on the pager so both the column flow and the snap rails
    // inherit the same page width.
    m.pager.style.setProperty('--page-width', `${m.width}px`);
    const count = Math.max(
      1,
      Math.round((m.pager.scrollWidth + m.gap) / m.stride),
    );
    setPageCount(count);
    return { count };
  }, [metrics]);

  const getCurrentPage = useCallback(() => {
    const m = metrics();
    if (!m) return 0;
    return Math.round(m.pager.scrollLeft / m.stride);
  }, [metrics]);

  const pageAt = useCallback(
    (element: Element) => {
      const m = metrics();
      if (!m) return 0;
      const left =
        element.getBoundingClientRect().left -
        m.pager.getBoundingClientRect().left +
        m.pager.scrollLeft;
      return Math.max(0, Math.round(left / m.stride));
    },
    [metrics],
  );

  const clearRoll = useCallback((pager: HTMLElement) => {
    for (const id of rollTimeouts.current) window.clearTimeout(id);
    rollTimeouts.current = [];
    pager.classList.remove(
      'is-rolling-out-up',
      'is-rolling-out-down',
      'is-rolling-in-up',
      'is-rolling-in-down',
    );
  }, []);

  const goToPage = useCallback(
    (target: number, mode: 'swap' | 'slide' | 'jump' = 'swap') => {
      const m = metrics();
      if (!m) return;
      const count = Math.max(
        1,
        Math.round((m.pager.scrollWidth + m.gap) / m.stride),
      );
      const next = Math.min(Math.max(target, 0), count - 1);
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
      pager.classList.add(
        forward ? 'is-rolling-out-up' : 'is-rolling-out-down',
      );
      rollTimeouts.current.push(
        window.setTimeout(() => {
          pager.scrollTo({ left });
          pager.classList.remove('is-rolling-out-up', 'is-rolling-out-down');
          pager.classList.add(
            forward ? 'is-rolling-in-up' : 'is-rolling-in-down',
          );
        }, 270),
        window.setTimeout(() => clearRoll(pager), 780),
      );
    },
    [clearRoll, metrics],
  );

  const goToLastPage = useCallback(
    () => goToPage(Number.MAX_SAFE_INTEGER),
    [goToPage],
  );
  const goToPrevious = useCallback(
    () => goToPage(targetPageRef.current - 1),
    [goToPage],
  );
  const goToNext = useCallback(
    () => goToPage(targetPageRef.current + 1),
    [goToPage],
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
        const next = Math.round(m.pager.scrollLeft / m.stride);
        targetPageRef.current = next;
        setPage(next);
      }
    };

    pager.addEventListener('scroll', onScroll, { passive: true });
    return () => pager.removeEventListener('scroll', onScroll);
  }, [metrics]);

  // Re-measure when the pager itself resizes or the webfonts finish
  // loading. Content-driven scrollWidth growth is covered by the callers
  // of measure() on every content change; observing the flow here would
  // re-trigger on measure()'s own --page-width writes.
  useEffect(() => {
    const pager = pagerRef.current;
    if (!pager) return;
    let lastWidth = pager.clientWidth;
    const realign = () => {
      measure();
      goToPage(getCurrentPage(), 'jump');
    };
    const observer = new ResizeObserver(() => {
      if (pager.clientWidth === lastWidth) return;
      lastWidth = pager.clientWidth;
      realign();
    });
    observer.observe(pager);
    // Font swap changes the column fill (scrollWidth, not clientWidth),
    // so always remeasure; goToPage bails out if already aligned.
    document.fonts?.ready.then(() => realign()).catch(() => {});
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measure]);

  // Arrow keys flip pages unless focus is in a text field.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
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
  }, [goToPage]);

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
    measure,
  };
}
