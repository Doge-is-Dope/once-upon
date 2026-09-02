'use client';

import { CheckIcon } from '@phosphor-icons/react/dist/ssr/Check';
import { CopySimpleIcon } from '@phosphor-icons/react/dist/ssr/CopySimple';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useClipboardCopy } from './use-clipboard-copy';

export function CopyButton({
  text,
  idleLabel,
  copiedLabel = 'Copied',
  fallbackLabel = 'Copy this message',
  className = '',
  iconOnly = false,
  onCopied,
  onCopyFailed,
}: {
  text: string;
  idleLabel: string;
  copiedLabel?: string;
  fallbackLabel?: string;
  className?: string;
  iconOnly?: boolean;
  onCopied?: () => void;
  onCopyFailed?: () => void;
}) {
  const [showFallback, setShowFallback] = useState(false);
  const fallbackRef = useRef<HTMLTextAreaElement>(null);
  const handleCopyFailed = useCallback(() => {
    setShowFallback(true);
    onCopyFailed?.();
  }, [onCopyFailed]);
  const { copied, copy } = useClipboardCopy({
    text,
    onCopied,
    onFailed: handleCopyFailed,
  });

  useEffect(() => {
    if (!showFallback) return;
    fallbackRef.current?.focus();
    fallbackRef.current?.select();
  }, [showFallback]);

  return (
    <>
      <button
        aria-label={iconOnly ? (copied ? copiedLabel : idleLabel) : undefined}
        className={`copy-button${copied ? ' is-copied' : ''}${className ? ` ${className}` : ''}`}
        title={iconOnly ? (copied ? 'Copied' : idleLabel) : undefined}
        type="button"
        onClick={() => void copy()}
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
          <span>{fallbackLabel}</span>
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
