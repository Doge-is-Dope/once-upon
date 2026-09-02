import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  AgentPresence,
  presenceLabel,
  resolveAgentPresence,
} from '../components/frames/book/agent-presence';
import { applyActivity } from '../components/frames/book/use-webmcp-connection';
import { describeRevision } from '../components/frames/book/use-session-view';
import { experienceDefinition } from '../experiences/the-last-manuscript/definition';
import { createExperienceSession } from '../lib/runtime/engine';
import { testContext } from './helpers';

describe('agent presence', () => {
  it('derives the in-world state from connection and tool activity', () => {
    expect(resolveAgentPresence('unsupported', false, null)).toBe(
      'unavailable',
    );
    expect(resolveAgentPresence('connected', false, null)).toBe('waiting');
    expect(resolveAgentPresence('connected', true, null)).toBe('attached');
    expect(resolveAgentPresence('connected', true, 'get_story_state')).toBe(
      'reading',
    );
    expect(
      resolveAgentPresence('connected', true, 'commit_story_chapter'),
    ).toBe('writing');
    expect(
      resolveAgentPresence('connected', true, 'reveal_pressed_words'),
    ).toBe('using');
  });

  it('labels story-object use by the object, never by the tool name', () => {
    const label = presenceLabel(
      'using',
      'reveal_pressed_words',
      experienceDefinition,
    );
    expect(label).toBe('Agent using the Pencil…');
    expect(label).not.toContain('reveal_pressed_words');
    expect(presenceLabel('waiting', null, experienceDefinition)).toBe(
      'No agent yet',
    );
  });

  it('offers the starter only before the first agent call', () => {
    const waiting = renderToStaticMarkup(
      createElement(AgentPresence, {
        activeTool: null,
        agentActive: false,
        experience: experienceDefinition,
        onAnnounce: () => undefined,
        status: 'connected',
      }),
    );
    expect(waiting).toContain('No agent yet');
    expect(waiting).toContain(experienceDefinition.startMessage);
    expect(waiting).not.toContain('WebMCP');

    const attached = renderToStaticMarkup(
      createElement(AgentPresence, {
        activeTool: null,
        agentActive: true,
        experience: experienceDefinition,
        onAnnounce: () => undefined,
        status: 'connected',
      }),
    );
    expect(attached).toContain('Agent attached');
    expect(attached).not.toContain(experienceDefinition.startMessage);

    const unavailable = renderToStaticMarkup(
      createElement(AgentPresence, {
        activeTool: null,
        agentActive: false,
        experience: experienceDefinition,
        onAnnounce: () => undefined,
        status: 'unsupported',
      }),
    );
    expect(unavailable).toBe('');
  });

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
});

describe('agent write announcements', () => {
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
