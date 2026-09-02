'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ExperienceController } from '@/lib/runtime/controller';
import type { ExperienceSession } from '@/lib/runtime/types';
import { formatChapterLabel } from '@/lib/manuscript/prose';

const ANNOUNCEMENT_GAP_MS = 1200;

export function useSessionView(controller: ExperienceController) {
  // Lazy: the snapshot clone is only needed once, not on every render.
  const [session, setSession] = useState<ExperienceSession>(() =>
    structuredClone(controller.getSnapshot()),
  );
  const { announcement, announce } = useAnnouncer();
  const previous = useRef<ExperienceSession>(session);

  useEffect(() => {
    let disposed = false;
    const unsubscribe = controller.subscribe((next) => {
      if (disposed) return;
      const snapshot = structuredClone(next);
      const before = previous.current;
      setSession(snapshot);
      if (snapshot.revision !== before.revision) {
        const message = describeRevision(before, snapshot);
        if (message) announce(message);
      }
      previous.current = snapshot;
    });
    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [announce, controller]);

  return {
    session,
    announcement,
    announce,
  };
}

// Screen-reader messages from the agent's writes, the clue journal, and
// the connection all share one polite live region. Spacing them out keeps
// a chapter arrival from being overwritten by the clue it revealed.
function useAnnouncer() {
  const [announcement, setAnnouncement] = useState('');
  const queue = useRef<string[]>([]);
  const lastSpokenAt = useRef(0);
  const timer = useRef<number | null>(null);

  const flush = useCallback(function flushQueue(): void {
    timer.current = null;
    const next = queue.current.shift();
    if (next === undefined) return;
    lastSpokenAt.current = Date.now();
    // Re-announcing an identical string is a no-op for React state; a
    // trailing zero-width space toggles so repeats are still spoken.
    setAnnouncement((current) => (current === next ? `${next}​` : next));
    if (queue.current.length)
      timer.current = window.setTimeout(flushQueue, ANNOUNCEMENT_GAP_MS);
  }, []);

  const announce = useCallback(
    (message: string) => {
      if (!message) {
        setAnnouncement('');
        return;
      }
      queue.current.push(message);
      if (timer.current !== null) return;
      const wait = Math.max(
        0,
        ANNOUNCEMENT_GAP_MS - (Date.now() - lastSpokenAt.current),
      );
      if (wait === 0) flush();
      else timer.current = window.setTimeout(flush, wait);
    },
    [flush],
  );

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  return { announcement, announce };
}

export function describeRevision(
  before: ExperienceSession,
  after: ExperienceSession,
): string {
  const receipt = after.pendingTurn?.effectReceipt;
  if (
    after.phase === 'AWAITING_CHAPTER' &&
    receipt &&
    receipt.receiptId !== before.pendingTurn?.effectReceipt?.receiptId
  ) {
    if (receipt.presentation === 'memory_flashback')
      return 'A memory has been added to the manuscript.';
    if (receipt.presentation === 'pressed_writing')
      return 'The pencil has raised words on the notepad.';
    if (receipt.presentation === 'world_shift')
      return 'The door has opened onto the corridor.';
    return 'The page has changed.';
  }
  if (after.chapters.length > before.chapters.length) {
    const chapter = after.chapters.at(-1);
    const label = formatChapterLabel(after.chapters.length - 1);
    const arrival = chapter
      ? `${label} added: ${chapter.title}.`
      : `${label} added.`;
    return after.phase === 'COMPLETE'
      ? `${arrival} The manuscript is complete.`
      : arrival;
  }
  if (after.phase === 'AWAITING_CHAPTER' && before.phase === 'READY')
    return 'Your move is on the page. Your agent is writing the next chapter.';
  return '';
}
