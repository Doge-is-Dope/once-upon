import { getExperience } from '@/experiences/registry';
import {
  flattenParagraphBlocks,
  formatChapterLabel,
  hasMatchingParagraphStructure,
  hasRecordedEnding,
  hasSecondPersonPronoun,
} from '@/lib/manuscript/prose';
import type { SharedStorySubmissionV2 } from '@/lib/manuscript/read-model';
import { RUNTIME_LIMITS } from '@/lib/runtime/protocol';
import type {
  ExperienceDefinition,
  InteractionEffectReceipt,
} from '@/lib/runtime/types';

export const SHARE_LIMITS = {
  maxBytes: 100 * 1024,
  maxChapters: 40,
  titleMaxLength: 80,
  proseMaxLength: RUNTIME_LIMITS.chapterTextMaxLength,
  durationMs: 30 * 24 * 60 * 60 * 1_000,
  publishesPerHour: 10,
} as const;

export type SharedStoryDocumentV1 = {
  version: 1;
  title: string;
  createdAt: string;
  expiresAt: string;
  chapters: Array<{
    label: string;
    title: string;
    prose: string[];
    effect: null | {
      presentation: InteractionEffectReceipt['presentation'];
      title: string;
      paragraphs: string[];
    };
  }>;
};

export type SharedRecordText = {
  prose: string[];
  /** Present only for `record` stories. */
  recordProse?: string[];
};

export type SharedStoryDocumentV2 = {
  version: 2;
  /** Absent on documents stored before the field was added. */
  experienceId?: string;
  title: string;
  createdAt: string;
  expiresAt: string;
  chapters: Array<{
    label: string;
    title: string;
    prose: string[];
    recordProse?: string[];
    effect: null | {
      presentation: InteractionEffectReceipt['presentation'];
      title: string;
      paragraphs: string[];
      recordParagraphs?: string[];
      /**
       * The same text grouped per sealed fact with its authored heading, so
       * the reader page can follow the presentation's own rules. Absent on
       * documents stored before the field was added.
       */
      facts?: Array<{ heading?: string; paragraphs: string[] }>;
    };
  }>;
  completionPassage: SharedRecordText;
};

export type SharedStoryDocument = SharedStoryDocumentV1 | SharedStoryDocumentV2;

export type ValidatedShare = {
  submission: SharedStorySubmissionV2;
  document: SharedStoryDocumentV2;
};

export class ShareValidationError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

export function parseSharedStoryDocument(value: string): SharedStoryDocument {
  const document = JSON.parse(value) as unknown;
  if (
    !document ||
    typeof document !== 'object' ||
    !('version' in document) ||
    (document.version !== 1 && document.version !== 2) ||
    !('title' in document) ||
    typeof document.title !== 'string' ||
    !('createdAt' in document) ||
    typeof document.createdAt !== 'string' ||
    !('expiresAt' in document) ||
    typeof document.expiresAt !== 'string' ||
    !('chapters' in document) ||
    !Array.isArray(document.chapters)
  )
    throw new ShareValidationError('The shared manuscript is invalid.', 500);
  return document as SharedStoryDocument;
}

export type ExperienceLookup = (
  experienceId: string,
) => ExperienceDefinition | null;

export function validateSharedStorySubmission(
  value: unknown,
  now: number,
  lookupExperience: ExperienceLookup = getExperience,
): ValidatedShare {
  const root = exactRecord(value, [
    'version',
    'requestId',
    'experienceId',
    'storyId',
    'status',
    'chapters',
    'completionPassage',
  ]);
  if (root.version !== 2) throw new ShareValidationError('Unknown version.');
  if (!isUuid(root.requestId))
    throw new ShareValidationError('requestId must be a UUID.');
  if (typeof root.experienceId !== 'string')
    throw new ShareValidationError('Unknown experience.');
  const experience = lookupExperience(root.experienceId);
  if (!experience || root.storyId !== experience.story.id)
    throw new ShareValidationError('Unknown experience or story.');
  if (root.status !== 'COMPLETE')
    throw new ShareValidationError('Only completed stories can be shared.');
  if (!Array.isArray(root.chapters) || root.chapters.length < 1)
    throw new ShareValidationError('The manuscript has no chapters.');
  if (root.chapters.length > SHARE_LIMITS.maxChapters)
    throw new ShareValidationError('The manuscript has too many chapters.');
  const record = experience.story.narration === 'record';

  const chapters = root.chapters.map((entry, index) => {
    const chapter = exactRecord(entry, [
      'title',
      'prose',
      ...(record ? ['recordProse'] : []),
      'effectInteractionId',
    ]);
    const title = boundedText(
      chapter.title,
      'chapter title',
      SHARE_LIMITS.titleMaxLength,
    );
    const prose = boundedText(
      chapter.prose,
      'chapter prose',
      SHARE_LIMITS.proseMaxLength,
    );
    const recordProse = record
      ? boundedText(
          chapter.recordProse,
          'chapter recordProse',
          SHARE_LIMITS.proseMaxLength,
        )
      : undefined;
    if (recordProse !== undefined) validateRecordPair(prose, recordProse);
    if (
      chapter.effectInteractionId !== null &&
      typeof chapter.effectInteractionId !== 'string'
    )
      throw new ShareValidationError('Invalid chapter effect.');
    return {
      title,
      prose,
      recordProse,
      effectInteractionId: chapter.effectInteractionId as string | null,
      index,
    };
  });

  const prologue = chapters[0];
  if (
    prologue.title !== experience.story.prologue.title ||
    prologue.prose !== experience.story.prologue.prose ||
    (record &&
      prologue.recordProse !== experience.story.prologue.recordProse) ||
    prologue.effectInteractionId !== null
  )
    throw new ShareValidationError('The fixed prologue does not match.');

  const recordedEnding = hasRecordedEnding(experience.story.completionPassage);
  const completion = exactRecord(root.completionPassage, [
    'prose',
    ...(recordedEnding ? ['recordProse'] : []),
  ]);
  if (
    completion.prose !== experience.story.completionPassage.prose ||
    (recordedEnding &&
      completion.recordProse !== experience.story.completionPassage.recordProse)
  )
    throw new ShareValidationError(
      'The fixed completion passage does not match.',
    );

  const effectIds = chapters.flatMap(({ effectInteractionId }) =>
    effectInteractionId ? [effectInteractionId] : [],
  );
  const authoredIds = experience.story.interactions.map(({ id }) => id);
  if (
    effectIds.length !== authoredIds.length ||
    effectIds.some((id, index) => id !== authoredIds[index])
  )
    throw new ShareValidationError(
      'The story interactions are incomplete or out of order.',
    );
  if (chapters.at(-1)?.effectInteractionId !== authoredIds.at(-1))
    throw new ShareValidationError('The final interaction is missing.');

  const createdAt = new Date(now).toISOString();
  const expiresAt = new Date(now + SHARE_LIMITS.durationMs).toISOString();
  const document: SharedStoryDocumentV2 = {
    version: 2,
    experienceId: experience.id,
    title: experience.title,
    createdAt,
    expiresAt,
    chapters: chapters.map((chapter, index) => {
      const interaction = chapter.effectInteractionId
        ? experience.story.interactions.find(
            ({ id }) => id === chapter.effectInteractionId,
          )
        : null;
      return {
        label: formatChapterLabel(index),
        title: chapter.title,
        prose: flattenParagraphBlocks(chapter.prose),
        ...(chapter.recordProse !== undefined
          ? { recordProse: flattenParagraphBlocks(chapter.recordProse) }
          : {}),
        effect: interaction
          ? {
              presentation: interaction.presentation,
              title: interaction.title,
              paragraphs: interaction.sealedFacts.flatMap(({ value }) =>
                flattenParagraphBlocks(value),
              ),
              facts: interaction.sealedFacts.map(({ value, heading }) => ({
                ...(heading !== undefined ? { heading } : {}),
                paragraphs: flattenParagraphBlocks(value),
              })),
              ...(record
                ? {
                    recordParagraphs: interaction.sealedFacts.flatMap(
                      ({ recordValue }) =>
                        flattenParagraphBlocks(recordValue ?? ''),
                    ),
                  }
                : {}),
            }
          : null,
      };
    }),
    completionPassage: {
      prose: flattenParagraphBlocks(experience.story.completionPassage.prose),
      ...(recordedEnding
        ? {
            recordProse: flattenParagraphBlocks(
              experience.story.completionPassage.recordProse ?? '',
            ),
          }
        : {}),
    },
  };

  return {
    submission: {
      version: 2,
      requestId: root.requestId as string,
      experienceId: experience.id,
      storyId: experience.story.id,
      status: 'COMPLETE',
      chapters: chapters.map(
        ({ title, prose, recordProse, effectInteractionId }) => ({
          title,
          prose,
          ...(recordProse !== undefined ? { recordProse } : {}),
          effectInteractionId,
        }),
      ),
      completionPassage: {
        prose: completion.prose as string,
        ...(recordedEnding
          ? { recordProse: completion.recordProse as string }
          : {}),
      },
    },
    document,
  };
}

function validateRecordPair(prose: string, recordProse: string): void {
  if (!hasMatchingParagraphStructure(prose, recordProse))
    throw new ShareValidationError(
      'prose and recordProse must use the same paragraph structure.',
    );
  if (hasSecondPersonPronoun(recordProse))
    throw new ShareValidationError(
      'recordProse contains a second-person pronoun.',
    );
}

function exactRecord(
  value: unknown,
  keys: readonly string[],
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new ShareValidationError('Expected an object.');
  const record = value as Record<string, unknown>;
  const actual = Object.keys(record);
  if (
    actual.length !== keys.length ||
    actual.some((key) => !keys.includes(key)) ||
    keys.some((key) => !Object.hasOwn(record, key))
  )
    throw new ShareValidationError('Unexpected or missing fields.');
  return record;
}

function boundedText(value: unknown, name: string, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    throw new ShareValidationError(`${name} is missing or too long.`);
  return value;
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}
