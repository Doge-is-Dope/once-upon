'use client';

import { useEffect, useRef, useState } from 'react';
import type { ExperienceController } from '@/lib/runtime/controller';
import type { ExperienceSession, StoryDefinition } from '@/lib/runtime/types';
import { statusAnnouncement } from './formatters';
import {
  diffSessions,
  EMPTY_MOTION_CUES,
  EMPTY_UNSEEN,
  mergeUnseen,
  type MotionCues,
  type UnseenLedger,
} from './session-cues';

export interface SessionView {
  session: ExperienceSession | null;
  ready: boolean;
  error: string;
  fault: string;
  recoveryReady: boolean;
  announcement: string;
  streamingEntryId: string | null;
  motionCues: MotionCues;
  unseen: UnseenLedger;
  focusReaderToken: number;
  restartCount: number;
  dismissFault: () => void;
  markLedgerSeen: () => void;
  clearStreaming: () => void;
  consumeMotion: () => void;
}

// Mirrors the controller's session into React state and derives the
// presentation-only signals (motion cues, unseen ledger entries, streaming
// target, status announcements) by diffing consecutive sessions.
export function useSessionView(
  controller: ExperienceController,
  story: StoryDefinition,
): SessionView {
  const [session, setSession] = useState<ExperienceSession | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [fault, setFault] = useState('');
  const [recoveryReady, setRecoveryReady] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [streamingEntryId, setStreamingEntryId] = useState<string | null>(null);
  const [motionCues, setMotionCues] = useState<MotionCues>(EMPTY_MOTION_CUES);
  const [unseen, setUnseen] = useState<UnseenLedger>(EMPTY_UNSEEN);
  const [focusReaderToken, setFocusReaderToken] = useState(0);
  const [restartCount, setRestartCount] = useState(0);
  const lastRevision = useRef<number | null>(null);
  const lastNarrationLength = useRef<number | null>(null);
  const previousSession = useRef<ExperienceSession | null | undefined>(
    undefined,
  );

  useEffect(() => {
    let disposed = false;
    const unsubscribeFaults = controller.subscribeToFaults((message) => {
      if (!disposed) setFault(message);
    });
    const unsubscribe = controller.subscribe((next) => {
      if (disposed) return;
      const previous = previousSession.current;
      // One defensive clone serves both the rendered state and the next
      // diff's baseline; the frame never mutates sessions.
      const snapshot = next ? structuredClone(next) : null;
      setSession(snapshot);
      if (next && previous === null) setFocusReaderToken((token) => token + 1);
      if (!next && previous) setRestartCount((count) => count + 1);
      if (!next) setUnseen(EMPTY_UNSEEN);
      if (next && previous) {
        const diff = diffSessions(previous, next);
        setMotionCues(diff.motionCues);
        if (diff.isNewRevision)
          setUnseen((current) => mergeUnseen(current, diff.additions));
      } else {
        setMotionCues(EMPTY_MOTION_CUES);
      }
      const nextNarrationLength = next?.narrationEntries.length ?? 0;
      const newestEntry = next?.narrationEntries.at(-1);
      if (
        lastNarrationLength.current !== null &&
        nextNarrationLength > lastNarrationLength.current &&
        newestEntry &&
        newestEntry.turn > 0
      ) {
        setStreamingEntryId(newestEntry.id);
      }
      lastNarrationLength.current = nextNarrationLength;
      if (!next?.pendingResolution) setRecoveryReady(false);
      if (
        next &&
        lastRevision.current !== null &&
        next.revision !== lastRevision.current
      ) {
        setAnnouncement(statusAnnouncement(next, story));
        setFault('');
      }
      lastRevision.current = next?.revision ?? null;
      previousSession.current = snapshot;
    });
    void controller
      .initialize()
      .then((saved) => {
        if (disposed) return;
        if (saved?.pendingResolution) setRecoveryReady(true);
        setReady(true);
      })
      .catch((reason: unknown) => {
        console.error(reason);
        if (!disposed) {
          setError(
            reason instanceof Error && reason.message.startsWith('SAVE_CORRUPT')
              ? 'The saved manuscript could not be read. The old pages are kept safe; you can begin a new one.'
              : 'The manuscript could not be opened on this device.',
          );
          setReady(true);
        }
      });
    return () => {
      disposed = true;
      unsubscribe();
      unsubscribeFaults();
    };
  }, [controller, story]);

  useEffect(() => {
    if (!session?.pendingResolution || recoveryReady) return;
    const age = Date.now() - session.pendingResolution.createdAt;
    const timer = window.setTimeout(
      () => setRecoveryReady(true),
      Math.max(0, 20_000 - age),
    );
    return () => window.clearTimeout(timer);
  }, [session?.pendingResolution, recoveryReady]);

  return {
    session,
    ready,
    error,
    fault,
    recoveryReady,
    announcement,
    streamingEntryId,
    motionCues,
    unseen,
    focusReaderToken,
    restartCount,
    dismissFault: () => setFault(''),
    markLedgerSeen: () => setUnseen(EMPTY_UNSEEN),
    clearStreaming: () => setStreamingEntryId(null),
    consumeMotion: () =>
      setMotionCues((cues) => ({
        ...cues,
        resolutionId: null,
        abilityIds: [],
      })),
  };
}
