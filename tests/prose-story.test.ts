import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { StoryScroll } from '@/components/frames/desk/sheet';
import { createExperienceRegistry } from '@/experiences/registry';
import {
  createSharedStorySubmission,
  deriveManuscriptReadModel,
} from '@/lib/manuscript/read-model';
import { ExperienceController } from '@/lib/runtime/controller';
import {
  beginStoryTurn,
  commitStoryChapter,
  createExperienceSession,
  invokeStoryInteraction,
} from '@/lib/runtime/engine';
import type {
  ExperienceDefinition,
  ExperienceSession,
} from '@/lib/runtime/types';
import { validateSharedStorySubmission } from '@/lib/share/document';
import {
  livingManuscriptProtocol,
  registerExperienceTools,
} from '@/lib/webmcp/tools';
import {
  fixtureExperience,
  fixtureIds,
  monitoredFixtureExperience,
  recordFixtureExperience,
} from './support/fixture-story';
import { operationId, ordinaryProse, testContext } from './helpers';

const lookup = (id: string) =>
  id === fixtureExperience.id
    ? fixtureExperience
    : id === recordFixtureExperience.id
      ? recordFixtureExperience
      : id === monitoredFixtureExperience.id
        ? monitoredFixtureExperience
        : null;

describe('prose story with a recorded ending', () => {
  const { story } = monitoredFixtureExperience;

  it('is accepted while chapter-level record text stays rejected', () => {
    expect(story.narration).toBe('prose');
    expect(story.completionPassage.recordProse).toContain(
      'The subject continues walking.',
    );
    expect(() =>
      createExperienceRegistry([monitoredFixtureExperience]),
    ).not.toThrow();

    const strayPrologue: ExperienceDefinition = {
      ...monitoredFixtureExperience,
      story: {
        ...story,
        prologue: { ...story.prologue, recordProse: story.prologue.prose },
      },
    };
    expect(() => createExperienceRegistry([strayPrologue])).toThrow(
      'prose-only but declares record text',
    );

    const strayFact: ExperienceDefinition = {
      ...monitoredFixtureExperience,
      story: {
        ...story,
        interactions: story.interactions.map((interaction, index) =>
          index === 0
            ? {
                ...interaction,
                sealedFacts: interaction.sealedFacts.map((fact) => ({
                  ...fact,
                  recordValue: fact.value,
                })),
              }
            : interaction,
        ),
      },
    };
    expect(() => createExperienceRegistry([strayFact])).toThrow(
      'prose-only but declares record text',
    );

    const secondPersonEnding: ExperienceDefinition = {
      ...monitoredFixtureExperience,
      story: {
        ...story,
        completionPassage: {
          ...story.completionPassage,
          recordProse: story.completionPassage.prose,
        },
      },
    };
    expect(() => createExperienceRegistry([secondPersonEnding])).toThrow(
      'contains second person',
    );
  });

  it('asks the agent for prose only', async () => {
    expect(livingManuscriptProtocol(monitoredFixtureExperience)).not.toContain(
      'recordProse',
    );
    const schema = await commitSchema(monitoredFixtureExperience);
    expect(schema.properties).not.toHaveProperty('recordProse');
    expect(schema.required).not.toContain('recordProse');
  });

  it('rewrites and censors only the fixed ending', () => {
    const session = playToCompletion(testContext(), monitoredFixtureExperience);
    expect(session.phase).toBe('COMPLETE');
    expect(JSON.stringify(session)).not.toContain('recordProse');

    const complete = render(monitoredFixtureExperience, session, 'connected');
    expect(complete).toMatch(
      /class="completion-ending-text">[^<]*The subject continues walking\./,
    );
    // The original ending survives only as the hidden height reservation.
    expect(occurrences(complete, 'You keep walking.')).toBe(1);
    expect(occurrences(complete, 'class="completion-ending-sizer"')).toBe(2);
    expect(complete).not.toContain('sheet-rewrite-status');

    const restricted = render(
      monitoredFixtureExperience,
      createExperienceSession(monitoredFixtureExperience, testContext()),
      'unsupported',
    );
    expect(restricted).toContain('redacted-run');
  });

  it('shares the ending with both versions and the chapters with one', () => {
    const session = playToCompletion(testContext(), monitoredFixtureExperience);
    const model = deriveManuscriptReadModel(
      monitoredFixtureExperience,
      session,
    );
    expect(model.completionPassage.recordProse).toContain(
      'The subject continues walking.',
    );
    for (const chapter of model.chapters)
      expect(chapter).not.toHaveProperty('recordProse');

    const submission = createSharedStorySubmission(
      model,
      'd10cbb0f-b6f4-4d61-8cc5-1bf893f12431',
    );
    expect(submission.completionPassage).toHaveProperty('recordProse');
    for (const chapter of submission.chapters)
      expect(chapter).not.toHaveProperty('recordProse');

    const validated = validateSharedStorySubmission(
      submission,
      Date.UTC(2026, 7, 31),
      lookup,
    );
    expect(validated.document.completionPassage.recordProse).toEqual([
      expect.any(String),
      expect.stringContaining('The subject continues walking.'),
    ]);
    for (const chapter of validated.document.chapters)
      expect(chapter).not.toHaveProperty('recordProse');

    const { recordProse: _dropped, ...plainEnding } =
      submission.completionPassage;
    expect(() =>
      validateSharedStorySubmission(
        { ...submission, completionPassage: plainEnding },
        0,
        lookup,
      ),
    ).toThrow(/Unexpected or missing fields/);
  });
});

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe('prose-only story', () => {
  it('is accepted by the registry while record text stays paired', () => {
    expect(() => createExperienceRegistry([fixtureExperience])).not.toThrow();

    const strayRecord: ExperienceDefinition = {
      ...fixtureExperience,
      story: {
        ...fixtureExperience.story,
        prologue: {
          ...fixtureExperience.story.prologue,
          recordProse: fixtureExperience.story.prologue.prose,
        },
      },
    };
    expect(() => createExperienceRegistry([strayRecord])).toThrow(
      'prose-only but declares record text',
    );

    const missingRecordValue: ExperienceDefinition = {
      ...recordFixtureExperience,
      story: {
        ...recordFixtureExperience.story,
        interactions: recordFixtureExperience.story.interactions.map(
          (interaction) => ({
            ...interaction,
            sealedFacts: interaction.sealedFacts.map((fact) => {
              const plain = { ...fact };
              delete plain.recordValue;
              return plain;
            }),
          }),
        ),
      },
    };
    expect(() => createExperienceRegistry([missingRecordValue])).toThrow(
      'requires both authored text versions',
    );
  });

  it('plays to completion without any record text', () => {
    const context = testContext();
    const session = playToCompletion(context);

    expect(session.phase).toBe('COMPLETE');
    expect(session.chapters).toHaveLength(6);
    for (const chapter of session.chapters)
      expect(chapter).not.toHaveProperty('recordProse');
    expect(JSON.stringify(session)).not.toContain('recordProse');
  });

  it('rejects a chapter that carries recordProse', () => {
    const context = testContext();
    const initial = createExperienceSession(fixtureExperience, context);
    const started = beginStoryTurn(
      fixtureExperience,
      initial,
      {
        operationId: operationId('stray_begin'),
        expectedSessionId: initial.sessionId,
        expectedRevision: initial.revision,
        playerChoice: 'I read the blank ledger.',
      },
      context,
    ).session;
    const result = commitStoryChapter(
      fixtureExperience,
      started,
      {
        operationId: operationId('stray_commit'),
        expectedSessionId: started.sessionId,
        expectedRevision: started.revision,
        turnId: started.pendingTurn!.turnId,
        title: 'The ledger',
        prose: ordinaryProse,
        recordProse: ordinaryProse,
        continuitySummary: 'The ledger is still blank.',
        discoveryIds: [],
        status: 'continue',
      },
      context,
    );
    expect(result.response).toMatchObject({
      ok: false,
      code: 'INVALID_INPUT',
      message: expect.stringContaining('omit recordProse'),
    });
    expect(result.session).toBe(started);
  });

  it('drops the record layer from the agent protocol and commit schema', async () => {
    expect(livingManuscriptProtocol(recordFixtureExperience)).toContain(
      'recordProse',
    );
    expect(livingManuscriptProtocol(fixtureExperience)).not.toContain(
      'recordProse',
    );
    expect(livingManuscriptProtocol(fixtureExperience)).toContain(
      'Never add a new event.',
    );

    const proseSchema = await commitSchema(fixtureExperience);
    expect(proseSchema.properties).not.toHaveProperty('recordProse');
    expect(proseSchema.required).not.toContain('recordProse');

    const recordSchema = await commitSchema(recordFixtureExperience);
    expect(recordSchema.properties).toHaveProperty('recordProse');
    expect(recordSchema.required).toContain('recordProse');
  });

  it('shares the plain ending', () => {
    const session = playToCompletion(testContext());
    const model = deriveManuscriptReadModel(fixtureExperience, session);
    expect(model.completionPassage.prose).toContain('You keep walking.');
    expect(model.completionPassage.recordProse).toBeUndefined();
    expect(JSON.stringify(model)).not.toContain(
      'The subject continues walking.',
    );

    const submission = createSharedStorySubmission(
      model,
      'd10cbb0f-b6f4-4d61-8cc5-1bf893f12431',
    );
    expect(JSON.stringify(submission)).not.toContain('recordProse');

    const validated = validateSharedStorySubmission(
      submission,
      Date.UTC(2026, 7, 31),
      lookup,
    );
    expect(validated.document.completionPassage).not.toHaveProperty(
      'recordProse',
    );
    expect(validated.document.chapters.at(-1)?.effect).not.toHaveProperty(
      'recordParagraphs',
    );
    expect(JSON.stringify(validated.document)).not.toContain('recordProse');

    const withRecord = {
      ...submission,
      chapters: submission.chapters.map((chapter) => ({
        ...chapter,
        recordProse: chapter.prose,
      })),
    };
    expect(() => validateSharedStorySubmission(withRecord, 0, lookup)).toThrow(
      /Unexpected or missing fields/,
    );
  });

  it('settles the sheet without censor bars or an ending rewrite', () => {
    const session = playToCompletion(testContext());
    const complete = render(fixtureExperience, session, 'connected');
    expect(complete).not.toContain('sheet-rewrite-status');
    expect(complete).not.toContain('backspace');
    expect(complete).not.toContain('completion-ending-sizer');
    expect(complete).toContain('You keep walking.');
    expect(complete).not.toContain('The subject continues walking.');

    const restricted = render(
      fixtureExperience,
      createExperienceSession(fixtureExperience, testContext()),
      'unsupported',
    );
    expect(restricted).not.toContain('redacted-run');
    expect(restricted).toContain('the lamp went out');

    const recordRestricted = render(
      recordFixtureExperience,
      createExperienceSession(recordFixtureExperience, testContext()),
      'unsupported',
    );
    expect(recordRestricted).toContain('redacted-run');
  });
});

const originalDocument = Object.getOwnPropertyDescriptor(
  globalThis,
  'document',
);

afterEach(() => {
  if (originalDocument)
    Object.defineProperty(globalThis, 'document', originalDocument);
  else Reflect.deleteProperty(globalThis, 'document');
});

async function commitSchema(experience: ExperienceDefinition): Promise<{
  properties: Record<string, unknown>;
  required?: string[];
}> {
  const tools = new Map<string, WebMCPToolDefinition>();
  const context = Object.assign(new EventTarget(), {
    registerTool(tool: WebMCPToolDefinition) {
      tools.set(tool.name, tool);
      return Promise.resolve();
    },
  }) as WebMCPModelContext;
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { modelContext: context },
  });
  const controller = new ExperienceController(
    experience,
    createExperienceSession(experience, testContext()),
  );
  const cleanup = await registerExperienceTools(controller, () => undefined);
  const schema = tools.get('commit_story_chapter')!.inputSchema as {
    properties: Record<string, unknown>;
    required?: string[];
  };
  cleanup();
  return schema;
}

function render(
  experience: ExperienceDefinition,
  session: ExperienceSession,
  status: 'connected' | 'unsupported',
): string {
  return renderToStaticMarkup(
    createElement(StoryScroll, {
      agentActive: status === 'connected',
      experience,
      onAnnounce: () => undefined,
      pageNavigationEnabled: true,
      onRetryConnection: () => undefined,
      session,
      webMCPSetupHint: 'generic',
      webMCPStatus: status,
    }),
  );
}

function playToCompletion(
  context: ReturnType<typeof testContext>,
  experience: ExperienceDefinition = fixtureExperience,
): ExperienceSession {
  let session = createExperienceSession(experience, context);
  session = ordinaryTurn(
    session,
    'find_key',
    [fixtureIds.discoveries.key],
    context,
    experience,
  );
  session = interactionTurn(
    session,
    fixtureIds.interactions.drawer,
    context,
    experience,
  );
  session = finishTurn(
    session,
    'drawer_chapter',
    'continue',
    [],
    context,
    experience,
  );
  session = interactionTurn(
    session,
    fixtureIds.interactions.memory,
    context,
    experience,
  );
  session = finishTurn(
    session,
    'memory_chapter',
    'continue',
    [],
    context,
    experience,
  );
  session = ordinaryTurn(
    session,
    'find_panel',
    [fixtureIds.discoveries.panel],
    context,
    experience,
  );
  session = interactionTurn(
    session,
    fixtureIds.interactions.panel,
    context,
    experience,
  );
  return finishTurn(
    session,
    'panel_chapter',
    'complete',
    [],
    context,
    experience,
  );
}

function ordinaryTurn(
  session: ExperienceSession,
  suffix: string,
  discoveryIds: string[],
  context: ReturnType<typeof testContext>,
  experience: ExperienceDefinition = fixtureExperience,
): ExperienceSession {
  const started = beginStoryTurn(
    experience,
    session,
    {
      operationId: operationId(`${suffix}_begin`),
      expectedSessionId: session.sessionId,
      expectedRevision: session.revision,
      playerChoice: `I search for the ${suffix}.`,
    },
    context,
  ).session;
  return finishTurn(
    started,
    `${suffix}_chapter`,
    'continue',
    discoveryIds,
    context,
    experience,
  );
}

function interactionTurn(
  session: ExperienceSession,
  interactionId: string,
  context: ReturnType<typeof testContext>,
  experience: ExperienceDefinition = fixtureExperience,
): ExperienceSession {
  const result = invokeStoryInteraction(
    experience,
    session,
    {
      operationId: operationId(`${interactionId}_interaction`),
      expectedSessionId: session.sessionId,
      expectedRevision: session.revision,
      interactionId,
      playerChoice: `I use the ${interactionId}.`,
    },
    context,
  );
  if (!result.response.ok) throw new Error(result.response.message);
  return result.session;
}

function finishTurn(
  session: ExperienceSession,
  suffix: string,
  status: 'continue' | 'complete',
  discoveryIds: string[],
  context: ReturnType<typeof testContext>,
  experience: ExperienceDefinition = fixtureExperience,
): ExperienceSession {
  const receipt = session.pendingTurn?.effectReceipt;
  const result = commitStoryChapter(
    experience,
    session,
    {
      operationId: operationId(suffix),
      expectedSessionId: session.sessionId,
      expectedRevision: session.revision,
      turnId: session.pendingTurn!.turnId,
      title: 'The study answers',
      prose: ordinaryProse,
      continuitySummary:
        'You remain inside the study while the voice waits and the lamp keeps its light.',
      discoveryIds,
      effectReceiptId: receipt?.receiptId,
      representedFactIds: receipt?.factIds,
      status,
    },
    context,
  );
  if (!result.response.ok) throw new Error(result.response.message);
  return result.session;
}
