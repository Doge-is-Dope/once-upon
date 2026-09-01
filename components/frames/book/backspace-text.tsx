'use client';

import { useEffect, useState } from 'react';

const ERASE_MS = 9;
const EMPTY_PAUSE_MS = 260;
const TYPE_MS = 18;

export function BackspaceText({
  original,
  replacement,
}: {
  original: string;
  replacement: string;
}) {
  const [visibleText, setVisibleText] = useState(original);

  useEffect(() => {
    const before = Array.from(original);
    const after = Array.from(replacement);
    const eraseDuration = before.length * ERASE_MS;
    const total = backspaceDuration(original, replacement);
    const startedAt = performance.now();
    let frame = 0;

    const update = (now: number) => {
      const elapsed = now - startedAt;
      if (elapsed < eraseDuration) {
        const removed = Math.floor(elapsed / ERASE_MS);
        setVisibleText(before.slice(0, before.length - removed).join(''));
      } else if (elapsed < eraseDuration + EMPTY_PAUSE_MS) {
        setVisibleText('');
      } else {
        const typed = Math.min(
          after.length,
          Math.floor((elapsed - eraseDuration - EMPTY_PAUSE_MS) / TYPE_MS),
        );
        setVisibleText(after.slice(0, typed).join(''));
      }

      if (elapsed < total) frame = requestAnimationFrame(update);
      else setVisibleText(replacement);
    };

    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [original, replacement]);

  return (
    <span className="backspace-replacement">
      <span aria-hidden="true" className="backspace-replacement-measure">
        {original}
      </span>
      <span aria-hidden="true" className="backspace-replacement-measure">
        {replacement}
      </span>
      <span aria-hidden="true" className="backspace-replacement-visual">
        {visibleText}
        <span className="backspace-caret" />
      </span>
      <span className="sr-only">{replacement}</span>
    </span>
  );
}

export function backspaceDuration(
  original: string,
  replacement: string,
): number {
  return (
    Array.from(original).length * ERASE_MS +
    EMPTY_PAUSE_MS +
    Array.from(replacement).length * TYPE_MS
  );
}
