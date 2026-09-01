'use client';

import type { WebMCPStatus } from '@/lib/webmcp/tools';
import { CopyButton } from './copy-button';
import type { WebMCPSetupHint } from './use-webmcp-connection';

const REDACTION_BARS = ['a', 'b', 'c', 'd'] as const;
const WEBMCP_FLAG = 'chrome://flags/#enable-webmcp-testing';

export function WebMCPAvailability({
  status,
  setupHint,
  onRetry,
  onAnnounce,
}: {
  status: WebMCPStatus;
  setupHint: WebMCPSetupHint;
  onRetry: () => void;
  onAnnounce: (message: string) => void;
}) {
  if (status === 'connected') return null;

  const title =
    status === 'connecting'
      ? 'Checking access…'
      : status === 'error'
        ? 'Access interrupted'
        : 'Access restricted';
  const titleId = `webmcp-${status}-title`;

  return (
    <section
      aria-labelledby={titleId}
      className={`webmcp-availability webmcp-availability-${status}`}
      data-webmcp-availability
    >
      <div aria-hidden="true" className="webmcp-redactions">
        <RedactionGroup position="top" />
        <RedactionGroup position="bottom" />
      </div>
      <div className="webmcp-availability-copy">
        <h2 id={titleId}>{title}</h2>
        {status === 'unsupported' ? (
          setupHint === 'chrome-flag' ? (
            <div className="webmcp-flag-setup">
              <p>Enable the Chrome flag:</p>
              <div className="webmcp-flag-result">
                <code>{WEBMCP_FLAG}</code>
                <CopyButton
                  className="inline-copy-action webmcp-flag-copy"
                  copiedLabel="Chrome flag copied"
                  fallbackLabel="Copy this Chrome flag"
                  iconOnly
                  idleLabel="Copy Chrome flag"
                  onCopied={() => onAnnounce('Chrome flag copied.')}
                  onCopyFailed={() =>
                    onAnnounce(
                      'The Chrome flag could not be copied. Select it to copy manually.',
                    )
                  }
                  text={WEBMCP_FLAG}
                />
              </div>
            </div>
          ) : (
            <p>A WebMCP-enabled browser is required.</p>
          )
        ) : null}
        {status === 'disabled' ? <p>WebMCP is blocked for this site.</p> : null}
        {status === 'error' ? (
          <>
            <p>WebMCP couldn’t start.</p>
            <button
              className="webmcp-availability-action"
              type="button"
              onClick={onRetry}
            >
              Try again
            </button>
          </>
        ) : null}
      </div>
    </section>
  );
}

function RedactionGroup({ position }: { position: 'top' | 'bottom' }) {
  return (
    <div className={`webmcp-redaction-group is-${position}`}>
      {REDACTION_BARS.map((bar) => (
        <span key={bar} />
      ))}
    </div>
  );
}
