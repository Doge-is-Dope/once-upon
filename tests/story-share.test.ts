import { describe, expect, it } from 'vitest';
import {
  createSharedStorySubmission,
  deriveManuscriptReadModel,
  manuscriptToText,
} from '../lib/manuscript/read-model';
import { createExperienceSession } from '../lib/runtime/engine';
import { testContext } from './helpers';
import { recordFixtureExperience } from './support/fixture-story';

describe('manuscript export', () => {
  it('exports reader content without runtime metadata', () => {
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
    const text = manuscriptToText(model);
    const completion = recordFixtureExperience.story.completionPassage;
    const completionParagraphs = completion.prose.split(/\n\s*\n/);
    const recordCompletionParagraphs = completion.recordProse!.split(/\n\s*\n/);

    expect(text).toContain('Unicode survives — 記憶');
    expect(text).toContain('The next page contains only reader-facing prose.');
    expect(text).not.toContain(
      'The next page contains only official record prose.',
    );
    expect(text).toContain(completionParagraphs[0]);
    expect(text).toContain(recordCompletionParagraphs.at(-1));
    expect(text).not.toContain(recordCompletionParagraphs[0]);
    expect(text).not.toContain('chapter_internal');
    expect(text).not.toContain('turn_internal');
    expect(text).not.toContain(session.sessionId);
    expect(text).not.toContain('continuitySummary');
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
