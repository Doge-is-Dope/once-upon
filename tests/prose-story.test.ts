import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { StoryScroll } from '@/components/frames/desk/sheet';
import { createExperienceRegistry } from '@/experiences/registry';
import {
  createSharedStorySubmission,
  deriveManuscriptReadModel,
  manuscriptToText,
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
  recordFixtureExperience,
} from './support/fixture-story';
import { operationId, ordinaryProse, testContext } from './helpers';

const lookup = (id: string) =>
  id === fixtureExperience.id
    ? fixtureExperience
    : id === recordFixtureExperience.id
      ? recordFixtureExperience
      : null;

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

  it('exports and shares the plain ending', () => {
    const session = playToCompletion(testContext());
    const model = deriveManuscriptReadModel(fixtureExperience, session);
    const text = manuscriptToText(model);
    expect(text).toContain('You keep walking.');
    expect(text).not.toContain('The subject continues walking.');

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
): ExperienceSession {
  let session = createExperienceSession(fixtureExperience, context);
  session = ordinaryTurn(
    session,
    'find_key',
    [fixtureIds.discoveries.key],
    context,
  );
  session = interactionTurn(session, fixtureIds.interactions.drawer, context);
  session = finishTurn(session, 'drawer_chapter', 'continue', [], context);
  session = interactionTurn(session, fixtureIds.interactions.memory, context);
  session = finishTurn(session, 'memory_chapter', 'continue', [], context);
  session = ordinaryTurn(
    session,
    'find_panel',
    [fixtureIds.discoveries.panel],
    context,
  );
  session = interactionTurn(session, fixtureIds.interactions.panel, context);
  return finishTurn(session, 'panel_chapter', 'complete', [], context);
}

function ordinaryTurn(
  session: ExperienceSession,
  suffix: string,
  discoveryIds: string[],
  context: ReturnType<typeof testContext>,
): ExperienceSession {
  const started = beginStoryTurn(
    fixtureExperience,
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
  );
}

function interactionTurn(
  session: ExperienceSession,
  interactionId: string,
  context: ReturnType<typeof testContext>,
): ExperienceSession {
  const result = invokeStoryInteraction(
    fixtureExperience,
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
): ExperienceSession {
  const receipt = session.pendingTurn?.effectReceipt;
  const result = commitStoryChapter(
    fixtureExperience,
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
