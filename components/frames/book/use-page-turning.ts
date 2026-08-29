'use client';

import { useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from './motion';

export interface TurnOverlay {
  indices: number[];
  direction: 'forward' | 'back';
  backIndex: number;
}

// The paging state machine: which leaf is open, the page-turn overlay, and
// the follow-the-latest-page behavior.
export function usePageTurning({
  latestLeaf,
  singlePage,
  focusReaderToken,
  onConsumeMotion,
}: {
  latestLeaf: number;
  singlePage: boolean;
  focusReaderToken: number;
  onConsumeMotion: () => void;
}) {
  const [activeLeaf, setActiveLeaf] = useState(latestLeaf);
  const [followingLatest, setFollowingLatest] = useState(true);
  const [newPageReady, setNewPageReady] = useState(false);
  const [turnOverlay, setTurnOverlay] = useState<TurnOverlay | null>(null);
  const previousLatest = useRef(latestLeaf);
  const animationTimer = useRef<number | null>(null);
  const readerRef = useRef<HTMLElement>(null);
  const spreadRef = useRef<HTMLDivElement>(null);

  const unit = singlePage ? activeLeaf : Math.floor(activeLeaf / 2);
  const maxUnit = singlePage ? latestLeaf : Math.floor(latestLeaf / 2);
  const visibleIndices = singlePage ? [activeLeaf] : [unit * 2, unit * 2 + 1];

  const clearOverlay = () => {
    if (animationTimer.current !== null)
      window.clearTimeout(animationTimer.current);
    animationTimer.current = null;
    spreadRef.current?.style.removeProperty('min-height');
    setTurnOverlay(null);
  };

  // Lock the spread's height while the leaf underneath swaps, so the
  // navigation bar does not jump at the start of a turn.
  const startTurnAnimation = (
    indices: number[],
    direction: 'forward' | 'back',
    backIndex: number,
  ) => {
    if (animationTimer.current !== null)
      window.clearTimeout(animationTimer.current);
    const spread = spreadRef.current;
    if (spread) spread.style.minHeight = `${spread.offsetHeight}px`;
    setTurnOverlay({ indices, direction, backIndex });
    animationTimer.current = window.setTimeout(clearOverlay, 700);
  };

  const turnTo = (targetLeaf: number, direction?: 'forward' | 'back') => {
    const safeTarget = Math.max(0, Math.min(latestLeaf, targetLeaf));
    const oldUnit = singlePage ? activeLeaf : Math.floor(activeLeaf / 2);
    const nextUnit = singlePage ? safeTarget : Math.floor(safeTarget / 2);
    if (oldUnit === nextUnit && safeTarget === activeLeaf) return;
    onConsumeMotion();
    const reduceMotion = prefersReducedMotion();
    if (turnOverlay) clearOverlay();
    if (oldUnit !== nextUnit && !reduceMotion) {
      const turnDirection =
        direction ?? (nextUnit > oldUnit ? 'forward' : 'back');
      // The back of the turning sheet is the destination page it lands on.
      const backIndex = singlePage
        ? safeTarget
        : turnDirection === 'forward'
          ? nextUnit * 2
          : nextUnit * 2 + 1;
      startTurnAnimation(visibleIndices, turnDirection, backIndex);
    }
    setActiveLeaf(safeTarget);
    const atLatest = nextUnit === maxUnit;
    setFollowingLatest(atLatest);
    if (atLatest) setNewPageReady(false);
  };

  useEffect(() => {
    if (latestLeaf <= previousLatest.current) {
      previousLatest.current = latestLeaf;
      return;
    }
    if (followingLatest) {
      const oldUnit = singlePage ? activeLeaf : Math.floor(activeLeaf / 2);
      const nextUnit = singlePage ? latestLeaf : Math.floor(latestLeaf / 2);
      if (oldUnit !== nextUnit && !prefersReducedMotion())
        startTurnAnimation(
          visibleIndices,
          'forward',
          singlePage ? latestLeaf : nextUnit * 2,
        );
      setActiveLeaf(latestLeaf);
    } else {
      setNewPageReady(true);
    }
    previousLatest.current = latestLeaf;
    // This effect responds only to a newly created leaf.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestLeaf]);

  useEffect(() => {
    if (focusReaderToken > 0) readerRef.current?.focus();
  }, [focusReaderToken]);

  useEffect(
    () => () => {
      if (animationTimer.current !== null)
        window.clearTimeout(animationTimer.current);
    },
    [],
  );

  const move = (delta: -1 | 1) => {
    const target = singlePage
      ? activeLeaf + delta
      : Math.max(0, (unit + delta) * 2);
    turnTo(target, delta > 0 ? 'forward' : 'back');
  };

  return {
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
  };
}
