'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export async function copyText(text: string): Promise<void> {
  if (!navigator.clipboard?.writeText)
    throw new Error('Clipboard access is unavailable in this browser.');
  return navigator.clipboard.writeText(text);
}

export function useClipboardCopy({
  text,
  onCopied,
  onFailed,
  resetAfterMs = 1800,
}: {
  text: string;
  onCopied?: () => void;
  onFailed?: () => void;
  resetAfterMs?: number;
}): { copied: boolean; copy: () => Promise<void> } {
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
    },
    [],
  );

  const copy = useCallback(async () => {
    try {
      await copyText(text);
      setCopied(true);
      onCopied?.();
      if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
      resetTimer.current = window.setTimeout(() => {
        setCopied(false);
        resetTimer.current = null;
      }, resetAfterMs);
    } catch {
      onFailed?.();
    }
  }, [onCopied, onFailed, resetAfterMs, text]);

  return { copied, copy };
}
