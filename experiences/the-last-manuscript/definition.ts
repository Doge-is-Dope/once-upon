import type { ExperienceDefinition } from '@/lib/runtime/types';
import { AGENT_CONTRACT, START_MESSAGE } from './content';
import { lastManuscriptStory } from './story';

export const THE_LAST_MANUSCRIPT_ID = 'the-last-manuscript';

export const experienceDefinition: ExperienceDefinition = {
  id: THE_LAST_MANUSCRIPT_ID,
  title: 'The Last Manuscript',
  story: lastManuscriptStory,
  frame: { id: 'book' },
  startMessage: START_MESSAGE,
  agentContract: AGENT_CONTRACT,
};
