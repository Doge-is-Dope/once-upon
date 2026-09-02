import { describe, expect, it } from 'vitest';
import { experienceDefinition } from '../experiences/the-last-manuscript/definition';
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

describe('player clue journal', () => {
  it('follows the complete authored reveal and lead sequence', () => {
    const context = testContext();
    let session = createExperienceSession(experienceDefinition, context);
    expect(clueSummary(session)).toEqual([
      ['The Torn Page', null],
      ['Behind the Wardrobe', null],
    ]);

    session = ordinaryTurn(session, 'find_pencil', ['pencil_found'], context);
    expect(clueSummary(session)).toEqual([
      [
        'The Pencil',
        'Turn the pencil sideways and shade across the shallow grooves on the blank page.',
      ],
      ['The Torn Page', null],
      ['Behind the Wardrobe', null],
    ]);

    session = interactionTurn(session, 'pressed_writing', 'pressed', context);
    expect(session.phase).toBe('AWAITING_CHAPTER');
    expect(clueSummary(session)).toEqual([
      ['The Impressed Note', null],
      ['The Pencil', null],
      ['The Torn Page', null],
      ['Behind the Wardrobe', null],
    ]);

    session = finishTurn(session, 'pressed_chapter', 'continue', [], context);
    expect(clueSummary(session)[0]).toEqual([
      'The Impressed Note',
      'Close my eyes and begin with the North Station announcement.',
    ]);

    session = interactionTurn(
      session,
      'north_station_memory',
      'memory',
      context,
    );
    expect(clueSummary(session).slice(0, 2)).toEqual([
      ['The Returned Memory', null],
      ['The Impressed Note', null],
    ]);

    session = finishTurn(session, 'memory_chapter', 'continue', [], context);
    expect(
      clueSummary(session).find(([title]) => title === 'Behind the Wardrobe'),
    ).toEqual([
      'Behind the Wardrobe',
      'Move the wardrobe aside and search the narrow gap where the tapping came from.',
    ]);

    session = ordinaryTurn(
      session,
      'find_manuscript',
      ['manuscript_found'],
      context,
    );
    expect(clueSummary(session)[0]).toEqual([
      'The Sewn Manuscript',
      'Open the sewn volume and read all the papers before deciding what to tell the speaker.',
    ]);

    session = interactionTurn(session, 'last_manuscript', 'last', context);
    expect(derivePlayerClues(experienceDefinition, session)).toHaveLength(6);
    expect(
      derivePlayerClues(experienceDefinition, session).every(
        ({ lead }) => lead === null,
      ),
    ).toBe(true);

    session = finishTurn(session, 'last_chapter', 'complete', [], context);
    expect(session.phase).toBe('COMPLETE');
    expect(
      derivePlayerClues(experienceDefinition, session).every(
        ({ lead }) => lead === null,
      ),
    ).toBe(true);
  });

  it('omits every locked clue and internal runtime term', () => {
    const context = testContext();
    const initial = createExperienceSession(experienceDefinition, context);
    const initialJson = JSON.stringify(
      derivePlayerClues(experienceDefinition, initial),
    );
    expect(initialJson).not.toMatch(
      /reveal_pressed_words|follow_north_station_memory|pencil_found|sixth_attempt_note|Sixth time|national_correction_network|North Station reads 183\/184/,
    );

    const pencil = ordinaryTurn(
      initial,
      'safe_pencil',
      ['pencil_found'],
      context,
    );
    const pencilJson = JSON.stringify(
      derivePlayerClues(experienceDefinition, pencil),
    );
    expect(pencilJson).toContain('The Pencil');
    expect(pencilJson).not.toMatch(
      /sixth_attempt_note|Sixth time|North Station reads 183\/184/,
    );
  });
});

function clueSummary(
  session: ExperienceSession,
): Array<[string, string | null]> {
  return derivePlayerClues(experienceDefinition, session).map(
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
    experienceDefinition,
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
    experienceDefinition,
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
    experienceDefinition,
    session,
    {
      operationId: operationId(suffix),
      expectedSessionId: session.sessionId,
      expectedRevision: session.revision,
      turnId: session.pendingTurn!.turnId,
      title: 'The room answers',
      prose: ordinaryProse,
      recordProse: ordinaryRecordProse,
      continuitySummary:
        'You remain inside the room while the wall speaker waits and the ventilation moves air behind the wardrobe.',
      discoveryIds,
      effectReceiptId: receipt?.receiptId,
      representedFactIds: receipt?.factIds,
      status,
    },
    context,
  ).session;
}
