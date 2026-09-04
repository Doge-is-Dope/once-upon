'use client';

import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import type { WebMCPStatus } from '@/lib/webmcp/tools';
import { CopyButton } from './copy-button';
import type { WebMCPSetupHint } from './use-webmcp-connection';

const WEBMCP_FLAG = 'chrome://flags/#enable-webmcp-testing';

export function AvailabilitySlip({
  title,
  titleId,
  headingLevel = 'h2',
  children,
  className = '',
  ...sectionProps
}: {
  title: string;
  titleId: string;
  headingLevel?: 'h1' | 'h2';
  children?: ReactNode;
} & ComponentPropsWithoutRef<'section'>) {
  const Heading = headingLevel;

  return (
    <section
      aria-labelledby={titleId}
      className={`webmcp-availability ${className}`.trim()}
      {...sectionProps}
    >
      <div className="webmcp-availability-copy">
        <Heading id={titleId}>{title}</Heading>
        {children}
      </div>
    </section>
  );
}

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
    <AvailabilitySlip
      className={`webmcp-availability-${status}`}
      data-webmcp-availability
      title={title}
      titleId={titleId}
    >
      {status === 'unsupported' ? (
        setupHint === 'chrome-flag' ? (
          <div className="webmcp-flag-setup">
            <p>Enable the Chrome flag:</p>
            <div className="webmcp-flag-result">
              <code>{WEBMCP_FLAG}</code>
              <CopyButton
                className="inline-copy-action"
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
          <p>This record can only be continued by an attached agent.</p>
        )
      ) : null}
      {status === 'disabled' ? (
        <p>Page tools are blocked for this site.</p>
      ) : null}
      {status === 'error' ? (
        <p>The connection to your agent did not start.</p>
      ) : null}
      {status === 'error' ? (
        <button
          className="webmcp-availability-action"
          type="button"
          onClick={onRetry}
        >
          Try again
        </button>
      ) : null}
    </AvailabilitySlip>
  );
}
