'use client';

import type { CSSProperties } from 'react';

const CHARACTER_MS = 45;

export function StoryHeaderTitle({ title }: { title: string }) {
  const { characterCount, durationMs } = headerTitleAnimation(title);
  const style = {
    '--header-title-characters': characterCount,
    '--header-title-duration': `${durationMs}ms`,
  } as CSSProperties;

  return (
    <span aria-hidden="true" className="story-header-title" style={style}>
      <span className="story-header-title-text">{title}</span>
      <span className="story-header-title-caret" />
    </span>
  );
}

function headerTitleAnimation(title: string): {
  characterCount: number;
  durationMs: number;
} {
  const characterCount = Math.max(1, Array.from(title).length);
  return {
    characterCount,
    durationMs: characterCount * CHARACTER_MS,
  };
}
