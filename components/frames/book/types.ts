import type {
  CanonicalEvent,
  FrameDefinition,
  TurnResolution,
} from '@/lib/runtime/types';

// Story-flavored copy the book frame renders but must not own. Each
// experience that uses the book frame supplies its own set.
export interface BookFrameCopy {
  tagline: string;
  prologueTitle: string;
  fallbackPageHeading: string;
  defaultProtagonist: string;
  preview: {
    prologueText: string;
    sampleTitle: string;
    sampleProse: string;
    sampleResolution: TurnResolution;
    sampleEvent: CanonicalEvent;
  };
}

export interface BookFrameDefinition extends FrameDefinition {
  id: 'book';
  narrationFormat: 'prose';
  copy: BookFrameCopy;
}

export function isBookFrameDefinition(
  frame: FrameDefinition,
): frame is BookFrameDefinition {
  return frame.id === 'book' && 'copy' in frame;
}
