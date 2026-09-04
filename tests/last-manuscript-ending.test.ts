import { describe, expect, it } from 'vitest';
import { experienceDefinition } from '@/experiences/the-last-manuscript/definition';
import {
  hasMatchingParagraphStructure,
  hasSecondPersonPronoun,
  resolveRecordedEnding,
  splitParagraphBlocks,
} from '@/lib/manuscript/prose';
import {
  parseSharedStoryDocument,
  validateSharedStorySubmission,
} from '@/lib/share/document';
import {
  beginStoryTurn,
  commitStoryChapter,
  createExperienceSession,
} from '@/lib/runtime/engine';
import { testContext } from './helpers';
import { makeCompleteShareSubmission } from './support/share-fixtures';

const { story, agentContract } = experienceDefinition;
const finalInteraction = story.interactions.at(-1)!;
const network = finalInteraction.sealedFacts.find(
  ({ id }) => id === 'national_correction_network',
)!;
const prose = splitParagraphBlocks(story.completionPassage.prose);
const record = splitParagraphBlocks(story.completionPassage.recordProse!);

describe('Last Manuscript stairwell escape', () => {
  it('rejects the authored exit sign before the final reveal', () => {
    const context = testContext();
    const initial = createExperienceSession(experienceDefinition, context);
    const { session } = beginStoryTurn(
      experienceDefinition,
      initial,
      {
        operationId: 'early_exit_begin',
        expectedSessionId: initial.sessionId,
        expectedRevision: initial.revision,
        playerChoice: 'I inspect the door.',
      },
      context,
    );
    const result = commitStoryChapter(
      experienceDefinition,
      session,
      {
        operationId: 'early_exit_commit',
        expectedSessionId: session.sessionId,
        expectedRevision: session.revision,
        turnId: session.pendingTurn!.turnId,
        title: 'The doorway',
        prose:
          'You look through the doorway and see a sign marked EXIT STAIRS beside the room. The lamp stays lit while the speaker waits for an answer.',
        continuitySummary: 'The door reveals the exit too early.',
        discoveryIds: [],
        status: 'continue',
      },
      context,
    );
    expect(result.response).toMatchObject({
      ok: false,
      code: 'SEALED_FACT_LEAK',
    });
    expect(result.session).toEqual(session);
  });

  it('establishes the exit before the network reveal and the approaching team', () => {
    const beats = [
      'Room Seven: prepare for transfer',
      'The handleless door unlocks',
      'You remain inside the room',
      'short side corridor',
      'EXIT STAIRS',
      'North Station reads 183/184',
      'The government maintains public history',
      'Beyond the turn, elevator doors slide open',
      'Trolley wheels bump over the threshold',
      'Someone says, “Room Seven.”',
    ].map((text) => network.value.indexOf(text));
    expect(beats.every((index) => index >= 0)).toBe(true);
    expect(beats).toEqual([...beats].sort((a, b) => a - b));
    expect(network.value).toContain('on the same side as your room');
    expect(story.prologue.prose).not.toMatch(/stairwell|transfer team/i);
    expect(finalInteraction.completionPolicy).toBe('must_complete');
    expect(story.completionRequiredFactIds).toEqual([
      'national_correction_network',
    ]);
    expect(story.interactions.map(({ toolName }) => toolName)).toEqual([
      'reveal_pressed_words',
      'follow_north_station_memory',
      'read_the_last_manuscript',
    ]);
  });

  it('keeps the agent in the room and gives the fixed passage the entire escape', () => {
    expect(agentContract.instructions).toContain(
      'inside the same room through the final agent chapter',
    );
    expect(agentContract.instructions).toContain(
      'do not write that escape yourself',
    );
    expect(network.agentNote).toContain(
      'Do not repeat the network explanation',
    );
    expect(network.agentNote).toContain('Do not move the team around the turn');
    expect(network.agentNote).toContain('not an arranged release');
    expect(prose).toHaveLength(3);
    expect(prose[0]).toContain('step out of the room');
    expect(prose[0]).toContain('push open the stairwell door');
    expect(prose[0]).toContain('You start down the stairs.');
    expect(prose[1]).toContain('At ground level');
    expect(prose[1]).toContain('door to the service lane');
    expect(prose[2]).toContain('manuscript is hidden beneath your coat');
    expect(prose[2]).toMatch(/You keep walking\.$/);
    expect(story.completionPassage.prose).not.toMatch(
      /elevator|No alarm|No footsteps/,
    );
  });

  it('preserves the first two escape paragraphs when only the last is rewritten', () => {
    expect(
      hasMatchingParagraphStructure(
        story.completionPassage.prose,
        story.completionPassage.recordProse!,
      ),
    ).toBe(true);
    expect(record).toHaveLength(3);
    expect(hasSecondPersonPronoun(story.completionPassage.recordProse!)).toBe(
      false,
    );
    expect(record[0]).toContain('starts down the stairs');
    expect(record[1]).toContain('door to the service lane');
    expect(record[2]).toMatch(/The subject continues walking\.$/);
    expect(resolveRecordedEnding(prose, record)).toEqual([
      prose[0],
      prose[1],
      record[2],
    ]);
  });

  it('shares the full escape and canonical approach without leaking agent guidance', () => {
    const submission = makeCompleteShareSubmission(undefined, {
      experience: experienceDefinition,
      lastChapterProse:
        'You stand inside Room Seven with the manuscript in your hands. The sound beyond the turn draws closer while the open doorway frames the short corridor.',
    });
    const { document } = validateSharedStorySubmission(
      submission,
      Date.UTC(2026, 8, 4),
    );
    expect(document.completionPassage.prose).toEqual(prose);
    expect(document.completionPassage.recordProse).toEqual(record);
    expect(document.chapters.at(-1)?.effect?.paragraphs).toContain(
      splitParagraphBlocks(network.value)[0],
    );
    expect(JSON.stringify(document)).not.toContain(network.agentNote!);
    expect(parseSharedStoryDocument(JSON.stringify(document))).toEqual(
      document,
    );
  });
});
