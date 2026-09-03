import type { ExperienceDefinition } from '@/lib/runtime/types';
import { AGENT_CONTRACT, START_MESSAGE } from './content';
import { lastManuscriptStory } from './story';

const THE_LAST_MANUSCRIPT_ID = 'the-last-manuscript';

export const experienceDefinition: ExperienceDefinition = {
  id: THE_LAST_MANUSCRIPT_ID,
  title: 'The Last Manuscript',
  story: lastManuscriptStory,
  frame: {
    id: 'book',
    copy: {
      turnPrompt: {
        opening: 'What do you inspect first?',
        openingWaiting: 'The speaker is waiting.',
        nextWaiting: 'The room is waiting.',
      },
      resumeMove: 'I inspect what has changed in the room.',
      hint: {
        opening:
          'Look closer at something on the page, answer the speaker, or test the door.',
      },
      notes: { eyebrow: 'Notes from the room' },
      shared: { returnLabel: 'Enter Room Seven' },
    },
  },
  startMessage: START_MESSAGE,
  agentContract: AGENT_CONTRACT,
};
