'use client';

import { useEffect, useState } from 'react';
import type { ExperienceController } from '@/lib/runtime/controller';
import { registerExperienceTools, type WebMCPStatus } from '@/lib/webmcp/tools';

// Registers the experience's WebMCP tools once the session view is ready and
// re-registers them on demand via retryConnection. `agentActive` flips to true
// on the agent's first tool call this page load and stays true — restarting a
// manuscript in the same chat keeps the agent attached.
export function useWebMCPConnection(controller: ExperienceController): {
  webMCPStatus: WebMCPStatus;
  agentActive: boolean;
  activeTool: string | null;
  retryConnection: () => void;
} {
  const [webMCPStatus, setWebMCPStatus] = useState<WebMCPStatus>('connecting');
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
        if (!disposed) setWebMCPStatus(status);
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
    agentActive,
    activeTool,
    retryConnection: () => setConnectAttempt((attempt) => attempt + 1),
  };
}
