'use client';

import { useEffect, useState } from 'react';
import type { ExperienceController } from '@/lib/runtime/controller';
import { registerExperienceTools, type WebMCPStatus } from '@/lib/webmcp/tools';

// Registers the experience's WebMCP tools once the session view is ready and
// re-registers them on demand via retryConnection.
export function useWebMCPConnection(
  controller: ExperienceController,
  ready: boolean,
  error: string,
): { webMCPStatus: WebMCPStatus; retryConnection: () => void } {
  const [webMCPStatus, setWebMCPStatus] = useState<WebMCPStatus>('connecting');
  const [connectAttempt, setConnectAttempt] = useState(0);

  useEffect(() => {
    if (!ready || error) return;
    let disposed = false;
    let unregisterTools: (() => void) | undefined;
    void registerExperienceTools(controller, (status) => {
      if (!disposed) setWebMCPStatus(status);
    }).then((cleanup) => {
      if (disposed) cleanup();
      else unregisterTools = cleanup;
    });
    return () => {
      disposed = true;
      unregisterTools?.();
    };
  }, [controller, ready, error, connectAttempt]);

  return {
    webMCPStatus,
    retryConnection: () => setConnectAttempt((attempt) => attempt + 1),
  };
}
