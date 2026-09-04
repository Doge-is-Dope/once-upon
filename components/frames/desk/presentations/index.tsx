import type { BookPresentationId } from '@/lib/frames/book';
import { generic } from './generic';
import { memoryFlashback } from './memory-flashback';
import { pressedWriting } from './pressed-writing';
import type { DeskPresentation } from './types';
import { worldShift } from './world-shift';

// Keyed by the frame manifest so adding an id to BOOK_PRESENTATION_IDS
// without a renderer here is a type error, and vice versa.
export const DESK_PRESENTATIONS: Record<BookPresentationId, DeskPresentation> =
  {
    generic,
    pressed_writing: pressedWriting,
    memory_flashback: memoryFlashback,
    world_shift: worldShift,
  };

export function resolvePresentation(id: string): DeskPresentation {
  return (
    (DESK_PRESENTATIONS as Record<string, DeskPresentation | undefined>)[id] ??
    DESK_PRESENTATIONS.generic
  );
}
