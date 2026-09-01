import { describe, expect, it } from 'vitest';
import {
  createSharedStorySubmission,
  deriveManuscriptReadModel,
  manuscriptToText,
} from '../lib/manuscript/read-model';
import { createExperienceSession } from '../lib/runtime/engine';
import { experienceDefinition } from '../experiences/the-last-manuscript/definition';
import { testContext } from './helpers';

describe('manuscript export', () => {
  it('exports reader content without runtime metadata', () => {
    const session = createExperienceSession(
      experienceDefinition,
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
    const model = deriveManuscriptReadModel(experienceDefinition, session);
    const text = manuscriptToText(model);

    expect(text).toContain('Unicode survives — 記憶');
    expect(text).toContain(
      'The next page contains only official record prose.',
    );
    expect(text).not.toContain(
      'The next page contains only reader-facing prose.',
    );
    expect(text).toContain(
      experienceDefinition.story.completionPassage.recordProse,
    );
    expect(text).not.toContain('chapter_internal');
    expect(text).not.toContain('turn_internal');
    expect(text).not.toContain(session.sessionId);
    expect(text).not.toContain('continuitySummary');
  });

  it('creates a strict completed-story submission in reading order', () => {
    const session = createExperienceSession(
      experienceDefinition,
      testContext(),
    );
    const model = deriveManuscriptReadModel(experienceDefinition, session);
    const submission = createSharedStorySubmission(
      model,
      'd10cbb0f-b6f4-4d61-8cc5-1bf893f12431',
    );

    expect(submission).toMatchObject({
      version: 2,
      status: 'COMPLETE',
      experienceId: experienceDefinition.id,
      storyId: experienceDefinition.story.id,
    });
    expect(submission.chapters[0]).toEqual({
      title: experienceDefinition.story.prologue.title,
      prose: experienceDefinition.story.prologue.prose,
      recordProse: experienceDefinition.story.prologue.recordProse,
      effectInteractionId: null,
    });
    expect(submission.completionPassage).toEqual(
      experienceDefinition.story.completionPassage,
    );
    expect(JSON.stringify(submission)).not.toContain(session.sessionId);
  });
});
