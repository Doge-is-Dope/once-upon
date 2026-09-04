import { describe, expect, it } from 'vitest';
import { resolveRecordedEnding } from '@/lib/manuscript/prose';
import {
  createSharedStorySubmission,
  deriveManuscriptReadModel,
} from '@/lib/manuscript/read-model';
import { createExperienceSession } from '@/lib/runtime/engine';
import { testContext } from './helpers';
import { recordFixtureExperience } from './support/fixture-story';

describe('manuscript read model', () => {
  it('derives reader content without runtime metadata', () => {
    const session = createExperienceSession(
      recordFixtureExperience,
      testContext(),
    );
    session.chapters.push({
      id: 'chapter_internal',
      title: 'Unicode survives — 記憶',
      prose: 'The next page contains only reader-facing prose.',
      recordProse: 'The next page contains only official record prose.',
      createdAt: 2,
      turnId: 'turn_internal',
      discoveryIds: [],
      effectReceiptId: null,
    });
    const model = deriveManuscriptReadModel(recordFixtureExperience, session);
    const completion = recordFixtureExperience.story.completionPassage;
    const completionParagraphs = completion.prose.split(/\n\s*\n/);
    const recordCompletionParagraphs = completion.recordProse!.split(/\n\s*\n/);
    const chapter = model.chapters.at(-1)!;

    expect(chapter.title).toBe('Unicode survives — 記憶');
    expect(chapter.prose).toBe(
      'The next page contains only reader-facing prose.',
    );
    expect(chapter.recordProse).toBe(
      'The next page contains only official record prose.',
    );
    expect(chapter).not.toHaveProperty('turnId');
    expect(chapter).not.toHaveProperty('createdAt');
    expect(model.completionPassage.prose).toBe(completion.prose);
    expect(model.completionPassage.recordProse).toBe(completion.recordProse);

    // The shared page swaps only the final paragraph for its record version.
    const ending = resolveRecordedEnding(
      completionParagraphs,
      recordCompletionParagraphs,
    );
    expect(ending[0]).toBe(completionParagraphs[0]);
    expect(ending.at(-1)).toBe(recordCompletionParagraphs.at(-1));
    expect(ending).not.toContain(recordCompletionParagraphs[0]);

    const serialized = JSON.stringify(model);
    expect(serialized).not.toContain('turn_internal');
    expect(serialized).not.toContain(session.sessionId);
    expect(serialized).not.toContain('continuitySummary');
  });

  it('creates a strict completed-story submission in reading order', () => {
    const session = createExperienceSession(
      recordFixtureExperience,
      testContext(),
    );
    const model = deriveManuscriptReadModel(recordFixtureExperience, session);
    const submission = createSharedStorySubmission(
      model,
      'd10cbb0f-b6f4-4d61-8cc5-1bf893f12431',
    );

    expect(submission).toMatchObject({
      version: 2,
      status: 'COMPLETE',
      experienceId: recordFixtureExperience.id,
      storyId: recordFixtureExperience.story.id,
    });
    expect(submission.chapters[0]).toEqual({
      title: recordFixtureExperience.story.prologue.title,
      prose: recordFixtureExperience.story.prologue.prose,
      recordProse: recordFixtureExperience.story.prologue.recordProse,
      effectInteractionId: null,
    });
    expect(submission.completionPassage).toEqual(
      recordFixtureExperience.story.completionPassage,
    );
    expect(JSON.stringify(submission)).not.toContain(session.sessionId);
  });
});
