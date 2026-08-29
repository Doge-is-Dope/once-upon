import type { BookFrameDefinition } from '@/components/frames/book/types';
import { PROSE_NARRATION_CONTRACT } from '@/lib/runtime/narration';
import type { ExperienceDefinition } from '@/lib/runtime/types';
import { BOOK_FRAME_COPY, CONTINUE_MESSAGE, START_MESSAGE } from './content';
import { lastTavernStory } from './story';

export const THE_LAST_MANUSCRIPT_ID = 'the-last-manuscript';

const bookFrame: BookFrameDefinition = {
  id: 'book',
  narrationFormat: 'prose',
  copy: BOOK_FRAME_COPY,
};

export const experienceDefinition: ExperienceDefinition = {
  id: THE_LAST_MANUSCRIPT_ID,
  title: 'The Last Manuscript',
  story: lastTavernStory,
  frame: bookFrame,
  narration: PROSE_NARRATION_CONTRACT,
  startMessage: START_MESSAGE,
  continueMessage: CONTINUE_MESSAGE,
};
