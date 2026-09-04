import type { BookFrameCopy, FrameDefinition } from '@/lib/runtime/types';

/**
 * Presentation ids the book frame can render. A story interaction names one
 * of these; the experience registry rejects any other id at load time so a
 * story cannot reference a presentation the frame has no renderer for.
 */
export const BOOK_PRESENTATION_IDS = [
  'generic',
  'pressed_writing',
  'memory_flashback',
  'world_shift',
] as const;
export type BookPresentationId = (typeof BOOK_PRESENTATION_IDS)[number];

export const FRAME_PRESENTATIONS: Record<
  FrameDefinition['id'],
  ReadonlySet<string>
> = {
  book: new Set<string>(BOOK_PRESENTATION_IDS),
};

export const DEFAULT_BOOK_COPY: BookFrameCopy = {
  runningHead: 'Record of proceedings',
  turnPrompt: {
    opening: 'What do you do first?',
    next: 'What do you do next?',
    openingWaiting: 'The page is waiting.',
    nextWaiting: 'The page is waiting.',
  },
  resumeMove: 'I look over what has changed.',
  hint: {
    opening:
      'Look closer at something on the page, or try something unexpected.',
    continuing:
      'Follow a detail from the latest chapter, revisit an earlier clue, or try something unexpected.',
  },
  notes: {
    title: 'Things I noticed',
  },
  shared: { returnLabel: 'Begin your own copy' },
};

/** Merges a story's overrides onto the frame defaults, one level deep. */
export function resolveBookCopy(frame: FrameDefinition): BookFrameCopy {
  const overrides = frame.copy ?? {};
  return {
    runningHead: overrides.runningHead ?? DEFAULT_BOOK_COPY.runningHead,
    turnPrompt: { ...DEFAULT_BOOK_COPY.turnPrompt, ...overrides.turnPrompt },
    resumeMove: overrides.resumeMove ?? DEFAULT_BOOK_COPY.resumeMove,
    hint: { ...DEFAULT_BOOK_COPY.hint, ...overrides.hint },
    notes: { ...DEFAULT_BOOK_COPY.notes, ...overrides.notes },
    shared: { ...DEFAULT_BOOK_COPY.shared, ...overrides.shared },
  };
}
