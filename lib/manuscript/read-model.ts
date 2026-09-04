import type {
  ExperienceDefinition,
  ExperienceSession,
  InteractionEffectReceipt,
  StoryNarration,
} from '@/lib/runtime/types';
import { formatChapterLabel } from './prose';

export type ManuscriptEffect = {
  receiptId: string;
  interactionId: string;
  presentation: InteractionEffectReceipt['presentation'];
  title: string;
  facts: Array<{
    id: string;
    value: string;
    recordValue?: string;
    heading?: string;
  }>;
};

export type ManuscriptChapterBlock = {
  id: string;
  label: string;
  title: string;
  prose: string;
  recordProse?: string;
  effect: ManuscriptEffect | null;
};

export type ManuscriptReadModel = {
  version: 2;
  experienceId: string;
  storyId: string;
  narration: StoryNarration;
  title: string;
  chapters: ManuscriptChapterBlock[];
  completionPassage: { prose: string; recordProse?: string };
};

export type SharedStorySubmissionV2 = {
  version: 2;
  requestId: string;
  experienceId: string;
  storyId: string;
  status: 'COMPLETE';
  chapters: Array<{
    title: string;
    prose: string;
    /** Present only for `record` stories. */
    recordProse?: string;
    effectInteractionId: string | null;
  }>;
  completionPassage: { prose: string; recordProse?: string };
};

export function deriveManuscriptReadModel(
  experience: ExperienceDefinition,
  session: ExperienceSession,
): ManuscriptReadModel {
  const effects = resolveChapterEffects(experience, session);
  return {
    version: 2,
    experienceId: experience.id,
    storyId: experience.story.id,
    narration: experience.story.narration,
    title: experience.title,
    chapters: session.chapters.map((chapter, index) => ({
      id: chapter.id,
      label: formatChapterLabel(index),
      title: chapter.title,
      prose: chapter.prose,
      ...(chapter.recordProse !== undefined
        ? { recordProse: chapter.recordProse }
        : {}),
      effect: effects.get(chapter.id) ?? null,
    })),
    completionPassage: experience.story.completionPassage,
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
    const facts = interaction.sealedFacts.flatMap(
      ({ id, recordValue, heading }) => {
        const fact = session.facts.find((candidate) => candidate.id === id);
        return fact
          ? [
              {
                id: fact.id,
                value: fact.value,
                ...(recordValue !== undefined ? { recordValue } : {}),
                ...(heading !== undefined ? { heading } : {}),
              },
            ]
          : [];
      },
    );
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
    // Only the visible fields cross into the page: the receipt's agent
    // notes stay with the agent.
    facts: receipt.facts.map(({ id, value }) => {
      const authored = interaction?.sealedFacts.find(
        (candidate) => candidate.id === id,
      );
      return {
        id,
        value,
        ...(authored?.recordValue !== undefined
          ? { recordValue: authored.recordValue }
          : {}),
        ...(authored?.heading !== undefined
          ? { heading: authored.heading }
          : {}),
      };
    }),
  };
}

export function createSharedStorySubmission(
  model: ManuscriptReadModel,
  requestId: string,
): SharedStorySubmissionV2 {
  // The server checks exact key sets, so record keys appear only when the
  // story keeps a record.
  const record = model.narration === 'record';
  return {
    version: 2,
    requestId,
    experienceId: model.experienceId,
    storyId: model.storyId,
    status: 'COMPLETE',
    chapters: model.chapters.map(({ title, prose, recordProse, effect }) => ({
      title,
      prose,
      ...(record && recordProse !== undefined ? { recordProse } : {}),
      effectInteractionId: effect?.interactionId ?? null,
    })),
    completionPassage: {
      prose: model.completionPassage.prose,
      // The ending's official wording travels in either narration mode.
      ...(model.completionPassage.recordProse !== undefined
        ? { recordProse: model.completionPassage.recordProse }
        : {}),
    },
  };
}
