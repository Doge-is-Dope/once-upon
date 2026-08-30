'use client';

import { createContext, useContext } from 'react';

// Frame-level UI signals for leaf components. The no-op default keeps the
// page-turn overlay clones and isolated renders safe.
export interface BookUi {
  agentActive: boolean;
  openLedger: () => void;
}

export const BookUiContext = createContext<BookUi>({
  agentActive: false,
  openLedger: () => {},
});

export function useBookUi(): BookUi {
  return useContext(BookUiContext);
}
