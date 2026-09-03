import type { ExperienceDefinition } from '../../lib/runtime/types';
import { recordFixtureExperience } from './fixture-story';

type ShareChapter = {
  title: string;
  prose: string;
  recordProse: string;
  effectInteractionId: string | null;
};

/** Resolves only the fixture story, the way the registry resolves real ones. */
export function lookupFixtureExperience(
  experienceId: string,
): ExperienceDefinition | null {
  return experienceId === recordFixtureExperience.id
    ? recordFixtureExperience
    : null;
}

/**
 * A complete, valid share payload: the fixed prologue, one chapter per
 * authored interaction in story order, and the fixed completion passage.
 * Pass `experience` to build the same shape for another story.
 */
export function makeCompleteShareSubmission(
  requestId = 'd10cbb0f-b6f4-4d61-8cc5-1bf893f12431',
  {
    experience = recordFixtureExperience,
    lastChapterProse = '<script>alert("never rendered as markup")</script>',
  }: { experience?: ExperienceDefinition; lastChapterProse?: string } = {},
) {
  const { story } = experience;
  const lastIndex = story.interactions.length - 1;
  const chapters: ShareChapter[] = [
    {
      title: story.prologue.title,
      prose: story.prologue.prose,
      recordProse: story.prologue.recordProse!,
      effectInteractionId: null,
    },
    ...story.interactions.map((interaction, index) =>
      index === lastIndex
        ? {
            title: 'The last page',
            prose: lastChapterProse,
            recordProse: lastChapterProse,
            effectInteractionId: interaction.id,
          }
        : {
            title: interaction.title,
            prose: `You follow ${interaction.title.toLowerCase()} and wait for what it changes.`,
            recordProse: `The subject follows ${interaction.title.toLowerCase()} and waits for what it changes.`,
            effectInteractionId: interaction.id,
          },
    ),
  ];
  return {
    version: 2,
    requestId,
    experienceId: experience.id,
    storyId: story.id,
    status: 'COMPLETE' as const,
    chapters,
    completionPassage: { ...story.completionPassage },
  };
}
