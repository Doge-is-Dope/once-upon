'use client';

import type { WebMCPStatus } from '@/lib/webmcp/tools';

const WEBMCP_SPEC_URL = 'https://webmachinelearning.github.io/webmcp/';

export function WebMCPAvailability({
  status,
  onRetry,
}: {
  status: WebMCPStatus;
  onRetry: () => void;
}) {
  if (status === 'connected') return null;
  if (status === 'connecting')
    return (
      <section
        aria-label="WebMCP availability"
        className="webmcp-availability is-pending"
        data-webmcp-availability
      >
        <p>Preparing agent tools…</p>
      </section>
    );
  if (status === 'unsupported')
    return (
      <section
        aria-labelledby="webmcp-unavailable-title"
        className="webmcp-availability"
        data-webmcp-availability
      >
        <h2 id="webmcp-unavailable-title">
          WebMCP isn&apos;t available for this page
        </h2>
        <p>
          WebMCP lets your agent interact with this story through tools exposed
          by the page. Open this page in a browser or app with a WebMCP-aware
          agent to play.
        </p>
        <a href={WEBMCP_SPEC_URL}>Learn about WebMCP</a>
      </section>
    );
  const disabled = status === 'disabled';
  return (
    <section
      aria-labelledby={`webmcp-${status}-title`}
      className="webmcp-availability"
      data-webmcp-availability
    >
      <h2 id={`webmcp-${status}-title`}>
        {disabled ? 'WebMCP is blocked for this page' : 'WebMCP couldn’t start'}
      </h2>
      {disabled ? (
        <p>Allow site tools for this page, then check again.</p>
      ) : null}
      <button
        className="webmcp-availability-action"
        type="button"
        onClick={onRetry}
      >
        {disabled ? 'Check again' : 'Try again'}
      </button>
    </section>
  );
}
