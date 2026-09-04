'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ExperienceController } from '@/lib/runtime/controller';
import {
  registerExperienceTools,
  type ToolActivity,
  type WebMCPStatus,
} from '@/lib/webmcp/tools';

const WEBMCP_FLAG_MIN_CHROME_MAJOR = 146;
const WEBMCP_FLAG_EXPIRY_CHROME_MAJOR = 155;

export type WebMCPSetupHint = 'chrome-flag' | 'generic';

export type BrowserIdentity = {
  userAgent: string;
  userAgentData?: {
    brands: ReadonlyArray<{ brand: string; version: string }>;
    mobile: boolean;
  };
};

export type AgentFailure = {
  toolName: string;
  code: string;
  message: string;
  at: number;
};

export type WebMCPConnection = {
  webMCPStatus: WebMCPStatus;
  setupHint: WebMCPSetupHint;
  /** True from the agent's first tool call this page load onward. */
  agentActive: boolean;
  /** The most recently invoked tool that is still running, if any. */
  activeTool: string | null;
  /** Wall-clock time of the last tool call activity, or null. */
  lastActivityAt: number | null;
  /** The most recent failed tool call, cleared by the next success. */
  lastFailure: AgentFailure | null;
  retryConnection: () => void;
};

// Registers the experience's WebMCP tools once the session view is ready and
// re-registers them on demand via retryConnection. `agentActive` flips to true
// on the agent's first tool call this page load and stays true — restarting a
// manuscript in the same chat keeps the agent attached.
export function useWebMCPConnection(
  controller: ExperienceController,
): WebMCPConnection {
  const [webMCPStatus, setWebMCPStatus] = useState<WebMCPStatus>('connecting');
  const [setupHint, setSetupHint] = useState<WebMCPSetupHint>('generic');
  const [agentActive, setAgentActive] = useState(false);
  const [running, setRunning] = useState<string[]>([]);
  const [lastActivityAt, setLastActivityAt] = useState<number | null>(null);
  const [lastFailure, setLastFailure] = useState<AgentFailure | null>(null);
  const [connectAttempt, setConnectAttempt] = useState(0);

  useEffect(() => {
    let disposed = false;
    let unregisterTools: (() => void) | undefined;
    const lifecycle = new AbortController();
    void registerExperienceTools(
      controller,
      (status) => {
        if (disposed) return;
        if (status === 'unsupported')
          setSetupHint(resolveWebMCPSetupHint(readBrowserIdentity()));
        setWebMCPStatus(status);
      },
      (activity) => {
        if (disposed) return;
        setAgentActive(true);
        setLastActivityAt(Date.now());
        setRunning((current) => applyActivity(current, activity));
        if (activity.phase !== 'settled' || activity.code === 'ABORTED') return;
        if (activity.ok) setLastFailure(null);
        else
          setLastFailure({
            toolName: activity.toolName,
            code: activity.code ?? 'ERROR',
            message: activity.message ?? '',
            at: Date.now(),
          });
      },
      lifecycle.signal,
    ).then((cleanup) => {
      if (disposed) cleanup();
      else unregisterTools = cleanup;
    });
    return () => {
      disposed = true;
      lifecycle.abort();
      unregisterTools?.();
    };
  }, [controller, connectAttempt]);

  const retryConnection = useCallback(
    () => setConnectAttempt((attempt) => attempt + 1),
    [],
  );

  return {
    webMCPStatus,
    setupHint,
    agentActive,
    activeTool: running.at(-1) ?? null,
    lastActivityAt,
    lastFailure,
    retryConnection,
  };
}

export function applyActivity(
  running: readonly string[],
  activity: ToolActivity,
): string[] {
  if (activity.phase === 'invoked') return [...running, activity.toolName];
  const index = running.lastIndexOf(activity.toolName);
  if (index === -1) return [...running];
  return [...running.slice(0, index), ...running.slice(index + 1)];
}

export function resolveWebMCPSetupHint(
  identity: BrowserIdentity,
): WebMCPSetupHint {
  const major = desktopGoogleChromeMajor(identity);
  if (
    major !== null &&
    major >= WEBMCP_FLAG_MIN_CHROME_MAJOR &&
    major < WEBMCP_FLAG_EXPIRY_CHROME_MAJOR
  )
    return 'chrome-flag';
  return 'generic';
}

function readBrowserIdentity(): BrowserIdentity {
  const currentNavigator = navigator as Navigator & {
    userAgentData?: BrowserIdentity['userAgentData'];
  };
  return {
    userAgent: currentNavigator.userAgent,
    userAgentData: currentNavigator.userAgentData,
  };
}

function desktopGoogleChromeMajor(identity: BrowserIdentity): number | null {
  if (identity.userAgentData) {
    if (identity.userAgentData.mobile) return null;
    const chrome = identity.userAgentData.brands.find(
      ({ brand }) => brand === 'Google Chrome',
    );
    return chrome ? parseMajor(chrome.version) : null;
  }

  if (
    /Android|Mobile|CriOS|EdgA|EdgiOS|OPR\/|SamsungBrowser\//.test(
      identity.userAgent,
    ) ||
    /Edg\//.test(identity.userAgent)
  )
    return null;
  const chrome = identity.userAgent.match(/Chrome\/(\d+)/);
  return chrome ? parseMajor(chrome[1]) : null;
}

function parseMajor(version: string): number | null {
  const major = Number.parseInt(version, 10);
  return Number.isFinite(major) ? major : null;
}
