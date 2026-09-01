'use client';

import { CheckIcon } from '@phosphor-icons/react/dist/ssr/Check';
import { CopySimpleIcon } from '@phosphor-icons/react/dist/ssr/CopySimple';
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
  iconOnly = false,
  onCopied,
  onCopyFailed,
}: {
  text: string;
  idleLabel: string;
  className?: string;
  iconOnly?: boolean;
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
        aria-label={iconOnly ? idleLabel : undefined}
        className={`copy-button${copied ? ' is-copied' : ''}${className ? ` ${className}` : ''}`}
        title={iconOnly ? (copied ? 'Copied' : idleLabel) : undefined}
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
        {iconOnly ? (
          copied ? (
            <CheckIcon aria-hidden="true" size={19} weight="bold" />
          ) : (
            <CopySimpleIcon aria-hidden="true" size={19} />
          )
        ) : copied ? (
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
