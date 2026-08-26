export interface ServerClock {
  offsetMs: number;
  measuredAtMonoMs: number;
}

export function monotonicNowMs(): number {
  return performance.timeOrigin + performance.now();
}

export function measureServerClock(serverNowMs: number, requestStartMonoMs: number, requestEndMonoMs: number): ServerClock {
  const midpoint = requestStartMonoMs + (requestEndMonoMs - requestStartMonoMs) / 2;
  return { offsetMs: serverNowMs - midpoint, measuredAtMonoMs: requestEndMonoMs };
}

export function remainingMs(deadlineMs: number | null, clock: ServerClock | null, nowMonoMs = monotonicNowMs()): number | null {
  if (deadlineMs === null) return null;
  const estimatedServerNow = nowMonoMs + (clock?.offsetMs ?? 0);
  return Math.max(0, deadlineMs - estimatedServerNow);
}

export function displaySeconds(valueMs: number | null): number | null {
  return valueMs === null ? null : Math.ceil(valueMs / 1000);
}
