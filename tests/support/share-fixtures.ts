import type { ExperienceDefinition } from '@/lib/runtime/types';
import { recordFixtureExperience } from './fixture-story';

type ShareChapter = {
  title: string;
  prose: string;
  recordProse?: string;
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
  // Chapter records exist only for record narration; the ending's record
  // travels whenever the story declares one.
  const record = story.narration === 'record';
  const withRecord = (
    chapter: ShareChapter,
    recordProse: string,
  ): ShareChapter => (record ? { ...chapter, recordProse } : chapter);
  const chapters: ShareChapter[] = [
    withRecord(
      {
        title: story.prologue.title,
        prose: story.prologue.prose,
        effectInteractionId: null,
      },
      story.prologue.recordProse ?? '',
    ),
    ...story.interactions.map((interaction, index) =>
      index === lastIndex
        ? withRecord(
            {
              title: 'The last page',
              prose: lastChapterProse,
              effectInteractionId: interaction.id,
            },
            lastChapterProse,
          )
        : withRecord(
            {
              title: interaction.title,
              prose: `You follow ${interaction.title.toLowerCase()} and wait for what it changes.`,
              effectInteractionId: interaction.id,
            },
            `The subject follows ${interaction.title.toLowerCase()} and waits for what it changes.`,
          ),
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
