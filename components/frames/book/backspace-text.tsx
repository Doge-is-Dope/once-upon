'use client';

import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';

const ERASE_MS = 9;
const EMPTY_PAUSE_MS = 260;
const TYPE_MS = 18;

/**
 * The record erases the reader's ending and retypes the official one.
 * Both texts are in the DOM from the first frame as one span per glyph;
 * erasing and retyping are per-glyph opacity animations scheduled with
 * CSS delays, so the multicol flow never re-fragments while it runs.
 * The measure spans lock the box to the larger of the two texts.
 */
export function BackspaceText({
  original,
  replacement,
}: {
  original: string;
  replacement: string;
}) {
  const rootRef = useRef<HTMLSpanElement | null>(null);
  const before = Array.from(original);
  const after = Array.from(replacement);
  const eraseDuration = before.length * ERASE_MS;

  // The caret chases the erase/retype head. Glyph positions are read once
  // in a single batch after mount; every frame after that only computes an
  // index from elapsed time and writes a transform — no layout reads.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const caret = root.querySelector<HTMLElement>('.backspace-caret');
    if (!caret) return;
    const measure = (selector: string) => {
      const rootRect = root.getBoundingClientRect();
      return Array.from(
        root.querySelectorAll<HTMLElement>(selector),
        (span) => {
          const rect = span.getBoundingClientRect();
          return {
            start: rect.left - rootRect.left,
            end: rect.right - rootRect.left,
            top: rect.top - rootRect.top,
          };
        },
      );
    };
    const originalGlyphs = measure('.backspace-original > span');
    const replacementGlyphs = measure('.backspace-typed > span');
    const rest = originalGlyphs[0] ??
      replacementGlyphs[0] ?? { start: 0, end: 0, top: 0 };
    const total = backspaceDuration(original, replacement);
    const startedAt = performance.now();
    let frame = 0;

    const place = (position: { end: number; top: number } | undefined) => {
      const target = position ?? { end: rest.start, top: rest.top };
      caret.style.transform = `translate(${target.end}px, ${target.top}px)`;
    };

    const update = (now: number) => {
      const elapsed = now - startedAt;
      if (elapsed < eraseDuration) {
        const visible = originalGlyphs.length - Math.floor(elapsed / ERASE_MS);
        place(originalGlyphs[visible - 1]);
      } else if (elapsed < eraseDuration + EMPTY_PAUSE_MS) {
        place(undefined);
      } else {
        const typed = Math.min(
          replacementGlyphs.length,
          Math.floor((elapsed - eraseDuration - EMPTY_PAUSE_MS) / TYPE_MS),
        );
        place(replacementGlyphs[typed - 1]);
      }
      if (elapsed < total) frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [eraseDuration, original, replacement]);

  return (
    <span className="backspace-replacement" ref={rootRef}>
      <span aria-hidden="true" className="backspace-replacement-measure">
        {original}
      </span>
      <span aria-hidden="true" className="backspace-replacement-measure">
        {replacement}
      </span>
      <span aria-hidden="true" className="backspace-original">
        {before.map((character, index) => (
          <span
            key={index}
            style={
              {
                '--td': `${(before.length - index) * ERASE_MS}ms`,
              } as CSSProperties
            }
          >
            {character}
          </span>
        ))}
      </span>
      <span aria-hidden="true" className="backspace-typed">
        {after.map((character, index) => (
          <span
            key={index}
            style={
              {
                '--td': `${eraseDuration + EMPTY_PAUSE_MS + (index + 1) * TYPE_MS}ms`,
              } as CSSProperties
            }
          >
            {character}
          </span>
        ))}
      </span>
      <span aria-hidden="true" className="backspace-caret" />
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
