'use client';

import { useEffect, useRef, useState } from 'react';

export async function copyText(text: string): Promise<void> {
  if (!navigator.clipboard?.writeText)
    throw new Error('Clipboard access is unavailable in this browser.');
  return navigator.clipboard.writeText(text);
}

export function CopyButton({
  text,
  idleLabel,
  className = '',
  onCopied,
  onCopyFailed,
}: {
  text: string;
  idleLabel: string;
  className?: string;
  onCopied?: () => void;
  onCopyFailed?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [showFallback, setShowFallback] = useState(false);
  const fallbackRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!showFallback) return;
    fallbackRef.current?.focus();
    fallbackRef.current?.select();
  }, [showFallback]);

  return (
    <>
      <button
        className={`copy-button${copied ? ' is-copied' : ''}${className ? ` ${className}` : ''}`}
        type="button"
        onClick={() =>
          void copyText(text)
            .then(() => {
              setCopied(true);
              onCopied?.();
              window.setTimeout(() => setCopied(false), 1800);
            })
            .catch(() => {
              setShowFallback(true);
              onCopyFailed?.();
            })
        }
      >
        {copied ? (
          <>
            <span aria-hidden="true">✓</span> Copied
          </>
        ) : (
          idleLabel
        )}
      </button>
      {showFallback ? (
        <label className="copy-fallback">
          <span>Copy this message</span>
          <textarea
            readOnly
            ref={fallbackRef}
            value={text}
            onFocus={(event) => event.currentTarget.select()}
          />
        </label>
      ) : null}
    </>
  );
}
