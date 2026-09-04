'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  derivePlayerClues,
  type PlayerClueEntry,
} from '@/lib/manuscript/clue-journal';
import type {
  ExperienceDefinition,
  ExperienceSession,
} from '@/lib/runtime/types';

// How long a freshly committed chapter may go without starting to type
// before its clues are shown anyway (reduced motion, no typing plan).
const REVEAL_WITHOUT_TYPING_MS = 1500;

interface SessionCount {
  sessionId: string;
  chapterCount: number;
}

interface AcknowledgedState {
  sessionId: string;
  ids: ReadonlySet<string>;
}

export interface ClueJournal {
  /** Clues the reader may see right now, newest first. */
  clues: PlayerClueEntry[];
  acknowledgedClueIds: ReadonlySet<string>;
  hasNewClues: boolean;
  /** Marks every visible clue as seen. */
  acknowledge: () => void;
}

// The notebook sits beside the page, so a clue that arrives with a new
// chapter waits until that chapter has finished typing: the notebook must
// never tell the reader what the page has not yet shown them. Clues that
// arrived earlier (an interaction's facts, the prologue) stay in view.
export function useClueJournal(
  experience: ExperienceDefinition,
  session: ExperienceSession,
  {
    typingActive,
    onAnnounce,
  }: { typingActive: boolean; onAnnounce: (message: string) => void },
): ClueJournal {
  const allClues = useMemo(
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
  const chapterCount = session.chapters.length;
  const sessionId = session.sessionId;
  const latestChapterAt = session.chapters.at(-1)?.createdAt ?? 0;

  // The chapter count whose clues have been shown. A restarted record
  // starts over from whatever it opens with.
  const [settled, setSettled] = useState<SessionCount>({
    sessionId,
    chapterCount,
  });
  if (settled.sessionId !== sessionId) setSettled({ sessionId, chapterCount });
  const settledCount =
    settled.sessionId === sessionId ? settled.chapterCount : chapterCount;
  const holding = chapterCount > settledCount;
  const clues = useMemo(
    () =>
      holding
        ? allClues.filter(({ revealedAt }) => revealedAt < latestChapterAt)
        : allClues,
    [allClues, holding, latestChapterAt],
  );

  const sawTyping = useRef(false);
  useEffect(() => {
    if (!holding) {
      sawTyping.current = false;
      return;
    }
    if (typingActive) {
      sawTyping.current = true;
      return;
    }
    const timer = window.setTimeout(
      () => setSettled({ sessionId, chapterCount }),
      sawTyping.current ? 0 : REVEAL_WITHOUT_TYPING_MS,
    );
    return () => window.clearTimeout(timer);
  }, [chapterCount, holding, sessionId, typingActive]);

  const [acknowledged, setAcknowledged] = useState<AcknowledgedState>(() => ({
    sessionId,
    ids: prologueClueIds,
  }));
  const acknowledgedClueIds =
    acknowledged.sessionId === sessionId ? acknowledged.ids : prologueClueIds;
  const hasNewClues = clues.some(({ id }) => !acknowledgedClueIds.has(id));

  const acknowledge = useCallback(() => {
    setAcknowledged((current) => {
      const base =
        current.sessionId === sessionId ? current.ids : prologueClueIds;
      const ids = clues.map(({ id }) => id);
      if (ids.every((id) => base.has(id))) return current;
      return { sessionId, ids: new Set([...base, ...ids]) };
    });
  }, [clues, prologueClueIds, sessionId]);

  const previousClues = useRef({
    sessionId,
    ids: new Set(clues.map(({ id }) => id)),
  });
  useEffect(() => {
    const previous = previousClues.current;
    const currentIds = new Set(clues.map(({ id }) => id));
    if (previous.sessionId !== sessionId) {
      previousClues.current = { sessionId, ids: currentIds };
      return;
    }
    const added = clues.filter(({ id }) => !previous.ids.has(id));
    previousClues.current = { sessionId, ids: currentIds };
    if (added.length === 1) onAnnounce(`New clue: ${added[0]!.title}.`);
    if (added.length > 1)
      onAnnounce(`New clues: ${added.map(({ title }) => title).join(', ')}.`);
  }, [clues, onAnnounce, sessionId]);

  return { clues, acknowledgedClueIds, hasNewClues, acknowledge };
}
