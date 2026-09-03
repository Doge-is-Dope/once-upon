import { describe, expect, it } from 'vitest';
import { derivePlayerClues } from '../lib/manuscript/clue-journal';
import {
  beginStoryTurn,
  commitStoryChapter,
  createExperienceSession,
  invokeStoryInteraction,
} from '../lib/runtime/engine';
import type { ExperienceSession } from '../lib/runtime/types';
import {
  operationId,
  ordinaryProse,
  ordinaryRecordProse,
  testContext,
} from './helpers';
import { recordFixtureExperience } from './support/fixture-story';

describe('player clue journal', () => {
  it('follows the complete authored reveal and lead sequence', () => {
    const context = testContext();
    let session = createExperienceSession(recordFixtureExperience, context);
    expect(clueSummary(session)).toEqual([
      ['The Blank Ledger', null],
      ['Behind the Lamp', null],
    ]);

    session = ordinaryTurn(session, 'find_key', ['key_found'], context);
    expect(clueSummary(session)).toEqual([
      ['The Key', 'Try the key in the drawer beneath the desk.'],
      ['The Blank Ledger', null],
      ['Behind the Lamp', null],
    ]);

    session = interactionTurn(session, 'drawer', 'drawer', context);
    expect(session.phase).toBe('AWAITING_CHAPTER');
    expect(clueSummary(session)).toEqual([
      ['The Drawer Note', null],
      ['The Key', null],
      ['The Blank Ledger', null],
      ['Behind the Lamp', null],
    ]);

    session = finishTurn(session, 'drawer_chapter', 'continue', [], context);
    expect(clueSummary(session)[0]).toEqual([
      'The Drawer Note',
      'Close my eyes and begin with the bell.',
    ]);

    session = interactionTurn(session, 'memory', 'memory', context);
    expect(clueSummary(session).slice(0, 2)).toEqual([
      ['The Returned Memory', null],
      ['The Drawer Note', null],
    ]);

    session = finishTurn(session, 'memory_chapter', 'continue', [], context);
    expect(
      clueSummary(session).find(([title]) => title === 'Behind the Lamp'),
    ).toEqual([
      'Behind the Lamp',
      'Move the lamp aside and search the wall behind it.',
    ]);

    session = ordinaryTurn(session, 'find_panel', ['panel_found'], context);
    expect(clueSummary(session)[0]).toEqual([
      'The Wall Panel',
      'Open the panel and read the ledger before answering the voice.',
    ]);

    session = interactionTurn(session, 'panel', 'panel', context);
    expect(derivePlayerClues(recordFixtureExperience, session)).toHaveLength(6);
    expect(
      derivePlayerClues(recordFixtureExperience, session).every(
        ({ lead }) => lead === null,
      ),
    ).toBe(true);

    session = finishTurn(session, 'panel_chapter', 'complete', [], context);
    expect(session.phase).toBe('COMPLETE');
    expect(
      derivePlayerClues(recordFixtureExperience, session).every(
        ({ lead }) => lead === null,
      ),
    ).toBe(true);
  });

  it('omits every locked clue and internal runtime term', () => {
    const context = testContext();
    const initial = createExperienceSession(recordFixtureExperience, context);
    const initialJson = JSON.stringify(
      derivePlayerClues(recordFixtureExperience, initial),
    );
    expect(initialJson).not.toMatch(
      /open_the_drawer|follow_the_memory|key_found|drawer_note|Do not answer yet|panel_truth|a corridor of doors/,
    );

    const key = ordinaryTurn(initial, 'safe_key', ['key_found'], context);
    const keyJson = JSON.stringify(
      derivePlayerClues(recordFixtureExperience, key),
    );
    expect(keyJson).toContain('The Key');
    expect(keyJson).not.toMatch(
      /drawer_note|Do not answer yet|a corridor of doors/,
    );
  });
});

function clueSummary(
  session: ExperienceSession,
): Array<[string, string | null]> {
  return derivePlayerClues(recordFixtureExperience, session).map(
    ({ title, lead }) => [title, lead],
  );
}

function ordinaryTurn(
  session: ExperienceSession,
  suffix: string,
  discoveryIds: string[],
  context: ReturnType<typeof testContext>,
): ExperienceSession {
  const started = beginStoryTurn(
    recordFixtureExperience,
    session,
    {
      operationId: operationId(`${suffix}_begin`),
      expectedSessionId: session.sessionId,
      expectedRevision: session.revision,
      playerChoice: `I investigate ${suffix}.`,
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
  suffix: string,
  context: ReturnType<typeof testContext>,
): ExperienceSession {
  return invokeStoryInteraction(
    recordFixtureExperience,
    session,
    {
      operationId: operationId(`${suffix}_interaction`),
      expectedSessionId: session.sessionId,
      expectedRevision: session.revision,
      interactionId,
      playerChoice: `I follow ${interactionId}.`,
    },
    context,
  ).session;
}

function finishTurn(
  session: ExperienceSession,
  suffix: string,
  status: 'continue' | 'complete' = 'continue',
  discoveryIds: string[] = [],
  context: ReturnType<typeof testContext> = testContext(),
): ExperienceSession {
  const receipt = session.pendingTurn?.effectReceipt;
  return commitStoryChapter(
    recordFixtureExperience,
    session,
    {
      operationId: operationId(suffix),
      expectedSessionId: session.sessionId,
      expectedRevision: session.revision,
      turnId: session.pendingTurn!.turnId,
      title: 'The study answers',
      prose: ordinaryProse,
      recordProse: ordinaryRecordProse,
      continuitySummary:
        'You remain inside the study while the voice waits and the lamp keeps its steady light against the wall.',
      discoveryIds,
      effectReceiptId: receipt?.receiptId,
      representedFactIds: receipt?.factIds,
      status,
    },
    context,
  ).session;
}
