'use client';

// Checked at event/effect time rather than subscribed to, so a mid-session
// preference change applies from the next animation onward.
export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
