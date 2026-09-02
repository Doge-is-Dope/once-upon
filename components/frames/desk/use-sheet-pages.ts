'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import type { RefObject } from 'react';

type PaginationMetrics = {
  pager: HTMLDivElement;
  flow: HTMLElement;
  stride: number;
  count: number;
  current: number;
};

type TurnMode = 'swap' | 'slide' | 'jump' | 'feed';

function paginationMetrics(pager: HTMLDivElement): PaginationMetrics | null {
  const width = pager.getBoundingClientRect().width;
  const flow = pager.querySelector<HTMLElement>('.sheet-flow');
  if (width === 0 || !flow) return null;
  const gapRem = Number.parseFloat(
    getComputedStyle(pager).getPropertyValue('--page-gap-rem'),
  );
  const rootFontSize = Number.parseFloat(
    getComputedStyle(document.documentElement).fontSize,
  );
  if (!Number.isFinite(gapRem) || !Number.isFinite(rootFontSize)) return null;
  const gap = gapRem * rootFontSize;
  const stride = width + gap;
  return {
    pager,
    flow,
    stride,
    count: pageCountFromExtent(flow.scrollWidth, stride, gap),
    current: Math.round(pager.scrollLeft / stride),
  };
}

export function pageCountFromExtent(
  contentWidth: number,
  stride: number,
  gap: number,
) {
  if (!Number.isFinite(contentWidth) || !Number.isFinite(stride) || stride <= 0)
    return 1;
  return Math.max(1, Math.round((contentWidth + gap) / stride));
}

/**
 * Keeps the case-file columns aligned with native horizontal scrolling.
 * CSS owns the page geometry and scroll snap; this hook only measures the
 * columns, exposes navigation, and restores the reader's page after reflow.
 */
export function usePagination({
  navigationEnabled = true,
  onManualNavigation,
}: {
  navigationEnabled?: boolean;
  onManualNavigation?: () => void;
} = {}): {
  pagerRef: RefObject<HTMLDivElement | null>;
  page: number;
  pageCount: number;
  goToPage: (target: number, mode?: TurnMode) => void;
  goToLastPage: (mode?: TurnMode) => void;
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
  const targetPage = useRef(0);

  const metrics = useCallback(() => {
    const pager = pagerRef.current;
    return pager ? paginationMetrics(pager) : null;
  }, []);

  const measure = useCallback(() => {
    const result = metrics();
    if (!result) return { count: 1 };
    const next = Math.min(targetPage.current, result.count - 1);
    targetPage.current = next;
    setPage(next);
    setPageCount(result.count);
    result.pager.scrollTo({ left: next * result.stride, behavior: 'auto' });
    return { count: result.count };
  }, [metrics]);

  const getCurrentPage = useCallback(() => metrics()?.current ?? 0, [metrics]);

  const pageAt = useCallback(
    (element: Element) => {
      const result = metrics();
      if (!result) return 0;
      const left =
        element.getBoundingClientRect().left -
        result.pager.getBoundingClientRect().left +
        result.pager.scrollLeft;
      return Math.max(0, Math.floor((left + 1) / result.stride));
    },
    [metrics],
  );

  const goToPage = useCallback(
    (requested: number, mode: TurnMode = 'swap') => {
      const result = metrics();
      if (!result) return;
      const next = Math.min(Math.max(requested, 0), result.count - 1);
      targetPage.current = next;
      setPage(next);
      result.pager.scrollTo({
        left: next * result.stride,
        behavior:
          mode === 'slide' &&
          !window.matchMedia('(prefers-reduced-motion: reduce)').matches
            ? 'smooth'
            : 'auto',
      });
    },
    [metrics],
  );

  const goToLastPage = useCallback(
    (mode: TurnMode = 'swap') => goToPage(Number.MAX_SAFE_INTEGER, mode),
    [goToPage],
  );

  const goToPrevious = useCallback(() => {
    if (!navigationEnabled) return;
    onManualNavigation?.();
    goToPage(targetPage.current - 1);
  }, [goToPage, navigationEnabled, onManualNavigation]);

  const goToNext = useCallback(() => {
    if (!navigationEnabled) return;
    onManualNavigation?.();
    goToPage(targetPage.current + 1);
  }, [goToPage, navigationEnabled, onManualNavigation]);

  const reflowTo = useCallback(
    (anchor: Element | null, mode: 'swap' | 'jump' = 'jump') => {
      const { count } = measure();
      const next = anchor
        ? pageAt(anchor)
        : Math.min(targetPage.current, count - 1);
      goToPage(next, mode);
    },
    [goToPage, measure, pageAt],
  );

  useLayoutEffect(() => {
    const pager = pagerRef.current;
    if (!pager) return;
    const onScroll = () => {
      const result = metrics();
      if (!result) return;
      targetPage.current = result.current;
      setPage(result.current);
    };
    pager.addEventListener('scroll', onScroll, { passive: true });
    return () => pager.removeEventListener('scroll', onScroll);
  }, [metrics]);

  useLayoutEffect(() => {
    const pager = pagerRef.current;
    if (!pager) return;
    let frame = 0;
    let lastWidth = -1;
    let lastHeight = -1;
    const realign = () => {
      const result = metrics();
      if (!result) return;
      const anchor =
        Array.from(result.flow.children).find(
          (child) => pageAt(child) >= result.current,
        ) ?? null;
      reflowTo(anchor, 'jump');
    };
    const observer = new ResizeObserver(([entry]) => {
      const box = entry?.contentRect;
      const width = box?.width ?? pager.clientWidth;
      const height = box?.height ?? pager.clientHeight;
      const initial = lastWidth < 0;
      if (width === lastWidth && height === lastHeight) return;
      lastWidth = width;
      lastHeight = height;
      if (initial) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(realign);
    });
    observer.observe(pager);
    void document.fonts?.ready.then(realign).catch(() => undefined);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [metrics, pageAt, reflowTo]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!navigationEnabled || event.defaultPrevented) return;
      if (event.metaKey || event.ctrlKey) return;
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      const target = event.target as HTMLElement | null;
      if (
        target?.isContentEditable ||
        (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
      )
        return;
      event.preventDefault();
      onManualNavigation?.();
      goToPage(targetPage.current + (event.key === 'ArrowLeft' ? -1 : 1));
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [goToPage, navigationEnabled, onManualNavigation]);

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
