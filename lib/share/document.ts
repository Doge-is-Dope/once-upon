import { getExperience } from '@/experiences/registry';
import type { SharedStorySubmissionV1 } from '@/lib/manuscript/read-model';
import type { InteractionEffectReceipt } from '@/lib/runtime/types';

export const SHARE_LIMITS = {
  maxBytes: 100 * 1024,
  maxChapters: 40,
  titleMaxLength: 80,
  proseMaxLength: 20_000,
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

export type ValidatedShare = {
  submission: SharedStorySubmissionV1;
  document: SharedStoryDocumentV1;
};

export class ShareValidationError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

export function validateSharedStorySubmission(
  value: unknown,
  now: number,
): ValidatedShare {
  const root = exactRecord(value, [
    'version',
    'requestId',
    'experienceId',
    'storyId',
    'status',
    'chapters',
  ]);
  if (root.version !== 1) throw new ShareValidationError('Unknown version.');
  if (!isUuid(root.requestId))
    throw new ShareValidationError('requestId must be a UUID.');
  if (typeof root.experienceId !== 'string')
    throw new ShareValidationError('Unknown experience.');
  const experience = getExperience(root.experienceId);
  if (!experience || root.storyId !== experience.story.id)
    throw new ShareValidationError('Unknown experience or story.');
  if (root.status !== 'COMPLETE')
    throw new ShareValidationError('Only completed stories can be shared.');
  if (!Array.isArray(root.chapters) || root.chapters.length < 1)
    throw new ShareValidationError('The manuscript has no chapters.');
  if (root.chapters.length > SHARE_LIMITS.maxChapters)
    throw new ShareValidationError('The manuscript has too many chapters.');

  const chapters = root.chapters.map((entry, index) => {
    const chapter = exactRecord(entry, [
      'title',
      'prose',
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
    if (
      chapter.effectInteractionId !== null &&
      typeof chapter.effectInteractionId !== 'string'
    )
      throw new ShareValidationError('Invalid chapter effect.');
    return {
      title,
      prose,
      effectInteractionId: chapter.effectInteractionId as string | null,
      index,
    };
  });

  const prologue = chapters[0];
  if (
    prologue.title !== experience.story.prologue.title ||
    prologue.prose !== experience.story.prologue.prose ||
    prologue.effectInteractionId !== null
  )
    throw new ShareValidationError('The fixed prologue does not match.');

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
  const lastEffect = chapters.at(-1)?.effectInteractionId;
  if (lastEffect !== authoredIds.at(-1))
    throw new ShareValidationError('The final interaction is missing.');

  const createdAt = new Date(now).toISOString();
  const expiresAt = new Date(now + SHARE_LIMITS.durationMs).toISOString();
  const document: SharedStoryDocumentV1 = {
    version: 1,
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
        label: index === 0 ? 'Prologue' : `Chapter ${index}`,
        title: chapter.title,
        prose: paragraphs(chapter.prose),
        effect: interaction
          ? {
              presentation: interaction.presentation,
              title: interaction.title,
              paragraphs: interaction.sealedFacts.flatMap(({ value }) =>
                paragraphs(value),
              ),
            }
          : null,
      };
    }),
  };

  return {
    submission: {
      version: 1,
      requestId: root.requestId as string,
      experienceId: experience.id,
      storyId: experience.story.id,
      status: 'COMPLETE',
      chapters: chapters.map(({ title, prose, effectInteractionId }) => ({
        title,
        prose,
        effectInteractionId,
      })),
    },
    document,
  };
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

function paragraphs(value: string): string[] {
  return value
    .trim()
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean);
}
