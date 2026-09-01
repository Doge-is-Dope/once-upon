import { experienceDefinition } from '../../experiences/the-last-manuscript/definition';

export function makeCompleteShareSubmission(
  requestId = 'd10cbb0f-b6f4-4d61-8cc5-1bf893f12431',
  {
    lastChapterProse = '<script>alert("never rendered as markup")</script>',
  } = {},
) {
  return {
    version: 2,
    requestId,
    experienceId: experienceDefinition.id,
    storyId: experienceDefinition.story.id,
    status: 'COMPLETE' as const,
    chapters: [
      {
        title: experienceDefinition.story.prologue.title,
        prose: experienceDefinition.story.prologue.prose,
        recordProse: experienceDefinition.story.prologue.recordProse,
        effectInteractionId: null,
      },
      {
        title: 'The pressed page',
        prose: 'The pencil reveals the marks without changing their words.',
        recordProse:
          'The pencil reveals the marks without changing their words.',
        effectInteractionId: 'pressed_writing',
      },
      {
        title: 'The memory',
        prose:
          'You open your eyes in the same room after the sequence returns.',
        recordProse:
          'The subject opens their eyes in the same room after the sequence returns.',
        effectInteractionId: 'north_station_memory',
      },
      {
        title: 'The last page',
        prose: lastChapterProse,
        recordProse: lastChapterProse,
        effectInteractionId: 'last_manuscript',
      },
    ],
    completionPassage: { ...experienceDefinition.story.completionPassage },
  };
}
