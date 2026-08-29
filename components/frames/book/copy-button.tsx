'use client';

import { useState } from 'react';

export async function copyText(text: string): Promise<void> {
  if (!navigator.clipboard?.writeText)
    throw new Error('Clipboard access is unavailable in this browser.');
  return navigator.clipboard.writeText(text);
}

export function CopyTooltip({
  id,
  message,
}: {
  id: string;
  message: string | null;
}) {
  if (!message) return null;
  return (
    <output aria-live="polite" className="copy-tooltip" id={id}>
      {message}
    </output>
  );
}

export function CopyButton({
  text,
  idleLabel,
  className = '',
}: {
  text: string;
  idleLabel: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [showFallback, setShowFallback] = useState(false);
  return (
    <>
      <button
        className={`copy-button${copied ? ' is-copied' : ''}${className ? ` ${className}` : ''}`}
        type="button"
        onClick={() =>
          void copyText(text)
            .then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1800);
            })
            .catch(() => setShowFallback(true))
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
            value={text}
            onFocus={(event) => event.currentTarget.select()}
          />
        </label>
      ) : null}
    </>
  );
}
