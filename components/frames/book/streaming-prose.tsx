'use client';

import { useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from './motion';

export function StreamingProse({
  prose,
  animate,
  onStreamed,
}: {
  prose: string;
  animate: boolean;
  onStreamed?: () => void;
}) {
  const [visibleLength, setVisibleLength] = useState(() =>
    animate && !prefersReducedMotion() ? 0 : prose.length,
  );
  const notifiedDone = useRef(false);
  const notifyDone = () => {
    if (notifiedDone.current) return;
    notifiedDone.current = true;
    onStreamed?.();
  };

  useEffect(() => {
    if (!animate) return;
    if (prefersReducedMotion()) {
      notifyDone();
      return;
    }
    const startedAt = performance.now();
    const duration = Math.min(2200, Math.max(1200, prose.length * 7));
    let frame = 0;
    const reveal = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      setVisibleLength((current) =>
        Math.max(
          current,
          wordBoundary(prose, Math.ceil(prose.length * progress)),
        ),
      );
      if (progress < 1) frame = window.requestAnimationFrame(reveal);
      else notifyDone();
    };
    frame = window.requestAnimationFrame(reveal);
    // Leaving the page mid-reveal counts as done, so it never replays.
    return () => {
      window.cancelAnimationFrame(frame);
      notifyDone();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animate, prose]);

  const isStreaming = visibleLength < prose.length;
  return (
    // Tap-to-skip is a shortcut only: the reveal self-completes within ~2s
    // and the full text is always present for assistive tech.
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <p
      className="manuscript-prose"
      data-testid="streaming-prose"
      data-streaming={isStreaming ? 'true' : 'false'}
      onPointerDown={() => {
        if (!isStreaming) return;
        setVisibleLength(prose.length);
        notifyDone();
      }}
    >
      <span className="sr-only">{prose}</span>
      <span aria-hidden="true">
        {prose.slice(0, visibleLength)}
        {isStreaming ? <span className="stream-caret" /> : null}
      </span>
    </p>
  );
}

function wordBoundary(prose: string, index: number): number {
  if (index <= 0) return 0;
  if (index >= prose.length) return prose.length;
  const nextSpace = prose.indexOf(' ', index);
  return nextSpace === -1 ? prose.length : nextSpace;
}
