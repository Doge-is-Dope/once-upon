'use client';

import { useSyncExternalStore } from 'react';

// Subscribes to one media query. The server snapshot is the desktop answer
// because the frame only ever renders on supported desktop widths.
export function useMediaQuery(query: string, serverMatches = true): boolean {
  return useSyncExternalStore(
    (onStoreChange) => {
      const media = window.matchMedia(query);
      media.addEventListener('change', onStoreChange);
      return () => media.removeEventListener('change', onStoreChange);
    },
    () => window.matchMedia(query).matches,
    () => serverMatches,
  );
}
