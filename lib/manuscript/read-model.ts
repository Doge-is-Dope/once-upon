import type {
  ExperienceDefinition,
  ExperienceSession,
  InteractionEffectReceipt,
} from '@/lib/runtime/types';

export type ManuscriptEffect = {
  receiptId: string;
  interactionId: string;
  presentation: InteractionEffectReceipt['presentation'];
  title: string;
  facts: Array<{ id: string; value: string }>;
};

export type ManuscriptChapterBlock = {
  id: string;
  label: string;
  title: string;
  prose: string;
  effect: ManuscriptEffect | null;
};

export type ManuscriptReadModel = {
  version: 1;
  experienceId: string;
  storyId: string;
  title: string;
  chapters: ManuscriptChapterBlock[];
};

export type SharedStorySubmissionV1 = {
  version: 1;
  requestId: string;
  experienceId: string;
  storyId: string;
  status: 'COMPLETE';
  chapters: Array<{
    title: string;
    prose: string;
    effectInteractionId: string | null;
  }>;
};

export function deriveManuscriptReadModel(
  experience: ExperienceDefinition,
  session: ExperienceSession,
): ManuscriptReadModel {
  const effects = resolveChapterEffects(experience, session);
  return {
    version: 1,
    experienceId: experience.id,
    storyId: experience.story.id,
    title: experience.title,
    chapters: session.chapters.map((chapter, index) => ({
      id: chapter.id,
      label: index === 0 ? 'Prologue' : `Chapter ${index}`,
      title: chapter.title,
      prose: chapter.prose,
      effect: effects.get(chapter.id) ?? null,
    })),
  };
}

export function resolveChapterEffects(
  experience: ExperienceDefinition,
  session: ExperienceSession,
): Map<string, ManuscriptEffect> {
  const effects = new Map<string, ManuscriptEffect>();
  const seenReceipts = new Set<string>();
  for (const chapter of session.chapters) {
    if (!chapter.effectReceiptId || seenReceipts.has(chapter.effectReceiptId))
      continue;
    const use = session.interactionUses.find(
      ({ receiptId }) => receiptId === chapter.effectReceiptId,
    );
    if (!use) continue;
    const interaction = experience.story.interactions.find(
      ({ id }) => id === use.interactionId,
    );
    if (!interaction) continue;
    const facts = interaction.sealedFacts.flatMap(({ id }) => {
      const fact = session.facts.find((candidate) => candidate.id === id);
      return fact ? [{ id: fact.id, value: fact.value }] : [];
    });
    seenReceipts.add(chapter.effectReceiptId);
    effects.set(chapter.id, {
      receiptId: chapter.effectReceiptId,
      interactionId: interaction.id,
      presentation: interaction.presentation,
      title: interaction.title,
      facts,
    });
  }
  return effects;
}

export function effectFromReceipt(
  experience: ExperienceDefinition,
  receipt: InteractionEffectReceipt,
): ManuscriptEffect {
  const interaction = experience.story.interactions.find(
    ({ id }) => id === receipt.interactionId,
  );
  return {
    receiptId: receipt.receiptId,
    interactionId: receipt.interactionId,
    presentation: receipt.presentation,
    title: interaction?.title ?? 'Story effect',
    facts: receipt.facts,
  };
}

export function manuscriptToText(model: ManuscriptReadModel): string {
  return [
    model.title,
    ...model.chapters.flatMap((chapter) => [
      `${chapter.label}: ${chapter.title}`,
      ...(chapter.effect
        ? [
            chapter.effect.title,
            ...chapter.effect.facts.map(({ value }) => value),
          ]
        : []),
      chapter.prose,
    ]),
  ]
    .map((part) => part.trim())
    .filter(Boolean)
    .join('\n\n');
}

export function createSharedStorySubmission(
  model: ManuscriptReadModel,
  requestId: string,
): SharedStorySubmissionV1 {
  return {
    version: 1,
    requestId,
    experienceId: model.experienceId,
    storyId: model.storyId,
    status: 'COMPLETE',
    chapters: model.chapters.map(({ title, prose, effect }) => ({
      title,
      prose,
      effectInteractionId: effect?.interactionId ?? null,
    })),
  };
}
