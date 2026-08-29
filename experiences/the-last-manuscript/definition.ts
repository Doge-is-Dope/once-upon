import { PROSE_NARRATION_CONTRACT } from '@/lib/runtime/narration';
import type { ExperienceDefinition } from '@/lib/runtime/types';
import { CONTINUE_MESSAGE, START_MESSAGE } from './content';
import { lastTavernStory } from './story';

export const THE_LAST_MANUSCRIPT_ID = 'the-last-manuscript';

export const experienceDefinition: ExperienceDefinition = {
  id: THE_LAST_MANUSCRIPT_ID,
  title: 'The Last Manuscript',
  story: lastTavernStory,
  frame: {
    id: 'book',
    narrationFormat: 'prose',
  },
  narration: PROSE_NARRATION_CONTRACT,
  startMessage: START_MESSAGE,
  continueMessage: CONTINUE_MESSAGE,
};
