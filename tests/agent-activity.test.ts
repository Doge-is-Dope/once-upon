import { describe, expect, it } from 'vitest';
import { describeRevision } from '../components/frames/desk/use-session-view';
import { applyActivity } from '../components/frames/desk/use-webmcp-connection';
import { experienceDefinition } from '../experiences/the-last-manuscript/definition';
import { createExperienceSession } from '../lib/runtime/engine';
import { testContext } from './helpers';

describe('agent activity', () => {
  it('tracks concurrent tool calls without dropping the running state early', () => {
    let running: string[] = [];
    running = applyActivity(running, {
      toolName: 'get_story_state',
      phase: 'invoked',
    });
    running = applyActivity(running, {
      toolName: 'begin_story_turn',
      phase: 'invoked',
    });
    running = applyActivity(running, {
      toolName: 'get_story_state',
      phase: 'settled',
      ok: true,
    });
    expect(running).toEqual(['begin_story_turn']);
    running = applyActivity(running, {
      toolName: 'begin_story_turn',
      phase: 'settled',
      ok: true,
    });
    expect(running).toEqual([]);
  });

  it('announces the move, the chapter, and the objects the agent used', () => {
    const before = createExperienceSession(experienceDefinition, testContext());
    const awaiting = structuredClone(before);
    awaiting.revision += 1;
    awaiting.phase = 'AWAITING_CHAPTER';
    awaiting.pendingTurn = {
      turnId: 'turn_1',
      kind: 'choice',
      playerChoice: 'I inspect the door.',
      createdAt: 1,
      interactionId: null,
      effectReceipt: null,
    };
    expect(describeRevision(before, awaiting)).toContain(
      'Your move is on the page',
    );

    const written = structuredClone(before);
    written.revision += 2;
    written.chapters.push({
      id: 'chapter_1',
      title: 'The handleless door',
      prose: 'You press the door.',
      recordProse: 'The subject presses the door.',
      createdAt: 2,
      turnId: 'turn_1',
      discoveryIds: [],
      effectReceiptId: null,
    });
    expect(describeRevision(before, written)).toBe(
      'Chapter 1 added: The handleless door.',
    );

    const pencil = structuredClone(awaiting);
    pencil.pendingTurn!.kind = 'interaction';
    pencil.pendingTurn!.effectReceipt = {
      receiptId: 'receipt_1',
      interactionId: 'pressed_words',
      presentation: 'pressed_writing',
      factIds: [],
      facts: [],
      createdAt: 3,
    };
    expect(describeRevision(before, pencil)).toBe(
      'The pencil has raised words on the notepad.',
    );
  });
});
