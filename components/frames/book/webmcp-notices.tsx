'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { WebMCPStatus } from '@/lib/webmcp/tools';
import { copyText, CopyTooltip } from './copy-button';

const CHROME_WEBMCP_FLAG = 'chrome://flags/#enable-webmcp-testing';

export function ConnectionIssueNotice({
  status,
  onRetry,
  compact = false,
}: {
  status: WebMCPStatus;
  onRetry: () => void;
  compact?: boolean;
}) {
  if (status === 'connected') return null;
  if (status === 'connecting')
    return (
      <output className="connection-pending">Checking browser support…</output>
    );
  if (status === 'disabled')
    return <WebMCPDisabledNotice onRetry={onRetry} compact={compact} />;
  if (status === 'unsupported')
    return (
      <div className="capability-notice" role="alert">
        <strong>WebMCP isn&apos;t available in this browser.</strong>
      </div>
    );
  return <ConnectionErrorNotice onRetry={onRetry} />;
}

function WebMCPDisabledNotice({
  onRetry,
  compact,
}: {
  onRetry: () => void;
  compact: boolean;
}) {
  return (
    <div
      className={`capability-notice${compact ? ' is-compact' : ''}`}
      role="alert"
    >
      <strong>Turn on WebMCP</strong>
      <p>
        <b>ChatGPT</b>
        <span>Browser settings → Permissions → Enable site tools</span>
      </p>
      <ChromeFlagRow />
      <button className="support-action" type="button" onClick={onRetry}>
        Check again
      </button>
    </div>
  );
}

function ConnectionErrorNotice({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="connection-error-notice" role="alert">
      <p>WebMCP couldn&apos;t start.</p>
      <button type="button" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}

function ChromeFlagRow() {
  const flagRef = useRef<HTMLInputElement>(null);
  return (
    <div className="chrome-flag-row">
      <span>Chrome</span>
      <input
        aria-label="Chrome WebMCP flag URL"
        readOnly
        ref={flagRef}
        value={CHROME_WEBMCP_FLAG}
        onFocus={(event) => event.currentTarget.select()}
      />
      <FlagCopyButton
        text={CHROME_WEBMCP_FLAG}
        onCopyFailure={() => {
          flagRef.current?.focus();
          flagRef.current?.select();
        }}
      />
    </div>
  );
}

type CopyFeedback = 'copied' | 'failed' | null;

function FlagCopyButton({
  text,
  onCopyFailure,
}: {
  text: string;
  onCopyFailure: () => void;
}) {
  const [feedback, setFeedback] = useState<CopyFeedback>(null);
  const [copying, setCopying] = useState(false);
  const timer = useRef<number | null>(null);
  const tooltipId = useId();

  const showFeedback = (next: Exclude<CopyFeedback, null>): void => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    setFeedback(next);
    timer.current = window.setTimeout(() => {
      setFeedback(null);
      timer.current = null;
    }, 5_000);
  };

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const copied = feedback === 'copied';
  return (
    <span className="flag-copy-control">
      <CopyTooltip
        id={tooltipId}
        message={
          feedback === 'copied'
            ? 'Copied'
            : feedback === 'failed'
              ? 'Copy failed'
              : null
        }
      />
      <button
        aria-describedby={feedback ? tooltipId : undefined}
        aria-label={copied ? 'Chrome flag URL copied' : 'Copy Chrome flag URL'}
        className="flag-copy-button"
        disabled={copying || copied}
        type="button"
        onClick={() => {
          setCopying(true);
          setFeedback(null);
          void copyText(text)
            .then(() => showFeedback('copied'))
            .catch(() => {
              showFeedback('failed');
              onCopyFailure();
            })
            .finally(() => setCopying(false));
        }}
      >
        {copied ? (
          <span className="flag-copy-check" aria-hidden="true">
            ✓
          </span>
        ) : (
          <span className="flag-copy-icon" aria-hidden="true" />
        )}
      </button>
    </span>
  );
}
