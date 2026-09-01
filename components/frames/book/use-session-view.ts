'use client';

import { useEffect, useRef, useState } from 'react';
import type { ExperienceController } from '@/lib/runtime/controller';
import type { ExperienceSession } from '@/lib/runtime/types';

export function useSessionView(controller: ExperienceController) {
  const initial = structuredClone(controller.getSnapshot());
  const [session, setSession] = useState<ExperienceSession>(initial);
  const [announcement, setAnnouncement] = useState('');
  const previous = useRef<ExperienceSession>(initial);

  useEffect(() => {
    let disposed = false;
    const unsubscribe = controller.subscribe((next) => {
      if (disposed) return;
      const snapshot = structuredClone(next);
      const before = previous.current;
      setSession(snapshot);
      if (snapshot.revision !== before.revision) {
        const presentation = snapshot.pendingTurn?.effectReceipt?.presentation;
        setAnnouncement(
          snapshot.phase === 'AWAITING_CHAPTER' &&
            presentation === 'memory_flashback'
            ? 'A memory has been added to the manuscript.'
            : '',
        );
      }
      previous.current = snapshot;
    });
    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [controller]);

  return {
    session,
    announcement,
    announce: setAnnouncement,
  };
}
