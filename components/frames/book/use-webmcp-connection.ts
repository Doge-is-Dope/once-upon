'use client';

import { useEffect, useState } from 'react';
import type { ExperienceController } from '@/lib/runtime/controller';
import { registerExperienceTools, type WebMCPStatus } from '@/lib/webmcp/tools';

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

// Registers the experience's WebMCP tools once the session view is ready and
// re-registers them on demand via retryConnection. `agentActive` flips to true
// on the agent's first tool call this page load and stays true — restarting a
// manuscript in the same chat keeps the agent attached.
export function useWebMCPConnection(controller: ExperienceController): {
  webMCPStatus: WebMCPStatus;
  setupHint: WebMCPSetupHint;
  agentActive: boolean;
  activeTool: string | null;
  retryConnection: () => void;
} {
  const [webMCPStatus, setWebMCPStatus] = useState<WebMCPStatus>('connecting');
  const [setupHint, setSetupHint] = useState<WebMCPSetupHint>('generic');
  const [agentActive, setAgentActive] = useState(false);
  const [activeTool, setActiveTool] = useState<string | null>(null);
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
        setActiveTool(activity.phase === 'invoked' ? activity.toolName : null);
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

  return {
    webMCPStatus,
    setupHint,
    agentActive,
    activeTool,
    retryConnection: () => setConnectAttempt((attempt) => attempt + 1),
  };
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
