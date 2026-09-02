'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

const ERASE_MS = 28;
const EMPTY_PAUSE_MS = 180;
const TYPE_MS = 36;

export type RewritePart =
  | { kind: 'same'; text: string }
  | { kind: 'change'; original: string; replacement: string };

type ChangePart = Extract<RewritePart, { kind: 'change' }>;

type RewriteProgress = {
  run: number;
  phase: 'erase' | 'pause' | 'type' | 'complete';
  visible: number;
};

/**
 * Revises only the phrases that differ between the reader's ending and the
 * official record. One recursive timer owns deletion, pause, typing, and the
 * completion signal; ordinary inline runs remain free to wrap across columns.
 */
export function BackspaceText({
  original,
  replacement,
  onComplete,
}: {
  original: string;
  replacement: string;
  onComplete: () => void;
}) {
  const parts = useMemo(
    () => buildRewriteParts(original, replacement),
    [original, replacement],
  );
  const changes = useMemo(
    () => parts.filter((part): part is ChangePart => part.kind === 'change'),
    [parts],
  );
  const [progress, setProgress] = useState<RewriteProgress>(() =>
    initialProgress(changes),
  );
  const completed = useRef(false);

  useEffect(() => {
    if (progress.phase === 'complete') {
      if (!completed.current) {
        completed.current = true;
        onComplete();
      }
      return;
    }

    const change = changes[progress.run];
    if (!change) return;

    const timer = window.setTimeout(
      () => setProgress((current) => advanceProgress(current, changes)),
      progress.phase === 'erase'
        ? ERASE_MS
        : progress.phase === 'pause'
          ? EMPTY_PAUSE_MS
          : TYPE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [changes, onComplete, progress]);

  return (
    <span className="backspace-replacement">
      <span aria-hidden="true" className="backspace-visual">
        {parts.map((part, index) => {
          if (part.kind === 'same') return part.text;
          const currentChange = parts
            .slice(0, index)
            .filter((candidate) => candidate.kind === 'change').length;
          const text = visibleChangeText(part, currentChange, progress);
          const active =
            currentChange === progress.run && progress.phase !== 'complete';
          return (
            <span className="backspace-run" key={index}>
              {text}
              {active ? <span className="backspace-caret" /> : null}
            </span>
          );
        })}
      </span>
      <span className="sr-only">{replacement}</span>
    </span>
  );
}

function initialProgress(changes: readonly ChangePart[]): RewriteProgress {
  const first = changes[0];
  return first
    ? {
        run: 0,
        phase: 'erase',
        visible: Array.from(first.original).length,
      }
    : { run: 0, phase: 'complete', visible: 0 };
}

function advanceProgress(
  current: RewriteProgress,
  changes: readonly ChangePart[],
): RewriteProgress {
  const change = changes[current.run];
  if (!change) return { ...current, phase: 'complete', visible: 0 };

  if (current.phase === 'erase') {
    if (current.visible > 1)
      return { ...current, visible: current.visible - 1 };
    return { ...current, phase: 'pause', visible: 0 };
  }
  if (current.phase === 'pause')
    return { ...current, phase: 'type', visible: 0 };
  if (current.phase === 'type') {
    const replacementLength = Array.from(change.replacement).length;
    if (current.visible < replacementLength)
      return { ...current, visible: current.visible + 1 };
    const nextRun = current.run + 1;
    const next = changes[nextRun];
    return next
      ? {
          run: nextRun,
          phase: 'erase',
          visible: Array.from(next.original).length,
        }
      : { run: current.run, phase: 'complete', visible: replacementLength };
  }
  return current;
}

function visibleChangeText(
  change: ChangePart,
  index: number,
  progress: RewriteProgress,
) {
  if (progress.phase === 'complete' || index < progress.run)
    return change.replacement;
  if (index > progress.run) return change.original;
  if (progress.phase === 'erase')
    return Array.from(change.original).slice(0, progress.visible).join('');
  if (progress.phase === 'pause') return '';
  return Array.from(change.replacement).slice(0, progress.visible).join('');
}

export function buildRewriteParts(
  original: string,
  replacement: string,
): RewritePart[] {
  if (original === replacement) return [{ kind: 'same', text: original }];
  const before = tokenize(original);
  const after = tokenize(replacement);
  const lengths = Array.from({ length: before.length + 1 }, () =>
    Array<number>(after.length + 1).fill(0),
  );

  for (let left = before.length - 1; left >= 0; left -= 1) {
    for (let right = after.length - 1; right >= 0; right -= 1) {
      lengths[left][right] =
        before[left] === after[right]
          ? lengths[left + 1][right + 1] + 1
          : Math.max(lengths[left + 1][right], lengths[left][right + 1]);
    }
  }

  const parts: RewritePart[] = [];
  let left = 0;
  let right = 0;
  let removed = '';
  let added = '';
  const flushChange = () => {
    if (!removed && !added) return;
    parts.push({ kind: 'change', original: removed, replacement: added });
    removed = '';
    added = '';
  };
  const appendSame = (text: string) => {
    const previous = parts.at(-1);
    if (previous?.kind === 'same') previous.text += text;
    else parts.push({ kind: 'same', text });
  };

  while (left < before.length || right < after.length) {
    if (
      left < before.length &&
      right < after.length &&
      before[left] === after[right]
    ) {
      flushChange();
      appendSame(before[left]);
      left += 1;
      right += 1;
    } else if (
      right >= after.length ||
      (left < before.length &&
        lengths[left + 1][right] >= lengths[left][right + 1])
    ) {
      removed += before[left] ?? '';
      left += 1;
    } else {
      added += after[right] ?? '';
      right += 1;
    }
  }
  flushChange();
  return parts;
}

function tokenize(text: string) {
  return text.match(/\S+\s*|\s+/g) ?? [];
}
