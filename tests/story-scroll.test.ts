import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { StoryScroll } from '../components/frames/book/story-scroll';
import type {
  ExperienceDefinition,
  ExperienceSession,
  InteractionEffectReceipt,
  StoryChapter,
} from '../lib/runtime/types';

const effectReceipt: InteractionEffectReceipt = {
  receiptId: 'effect_memory',
  interactionId: 'north_station_memory',
  presentation: 'memory_flashback',
  factIds: ['north_station_flashback', 'approved_north_station_account'],
  facts: [
    {
      id: 'north_station_flashback',
      value:
        'The gate reaches the floor before the first shot.\n\nSmoke comes later.',
    },
    {
      id: 'approved_north_station_account',
      value:
        'An equipment fire occurred. The evacuation was successful. No one died.',
    },
  ],
  createdAt: 2,
};

const experience: ExperienceDefinition = {
  id: 'memory-test',
  title: 'Memory test',
  frame: { id: 'book' },
  startMessage: 'Start.',
  agentContract: { version: 'memory-test-agent-v1', instructions: 'Continue.' },
  story: {
    id: 'memory-test-v1',
    prologue: {
      title: 'The room',
      prose: 'The question waits.',
      continuitySummary: 'The question waits.',
    },
    discoveryIds: [],
    discoveryRequirements: [],
    completionRequiredFactIds: [],
    interactions: [
      {
        id: 'north_station_memory',
        toolName: 'follow_north_station_memory',
        title: 'The North Station Memory',
        description: 'Follow the memory.',
        cue: 'Close your eyes.',
        requiredDiscoveryIds: [],
        requiredInteractionIds: [],
        requiredFactIds: [],
        sealedFacts: [
          {
            id: 'north_station_flashback',
            value: effectReceipt.facts[0]!.value,
            protectedTerms: [],
          },
          {
            id: 'approved_north_station_account',
            value: effectReceipt.facts[1]!.value,
            protectedTerms: [],
          },
        ],
        presentation: 'memory_flashback',
        completionPolicy: 'must_complete',
      },
    ],
  },
};

const prologue: StoryChapter = {
  id: 'chapter_prologue',
  title: 'The room',
  prose: 'The question waits.',
  createdAt: 1,
  turnId: null,
  discoveryIds: [],
  effectReceiptId: null,
};

describe('memory flashback presentation', () => {
  it('renders a pending flashback once before the writing marker', () => {
    const html = render(pendingSession());

    expect(occurrences(html, 'class="memory-flashback"')).toBe(1);
    expect(html).toContain('<h3>Memory</h3>');
    expect(html).toContain('data-effect-receipt="effect_memory"');
    expect(html).not.toContain('An equipment fire occurred.');
    expect(html.indexOf('class="memory-flashback')).toBeLessThan(
      html.indexOf('class="writing-marker"'),
    );
    expect(html).not.toContain('<dialog');
  });

  it('anchors the saved flashback to its chapter across later chapters', () => {
    const session = committedSession();
    const html = render(session);
    const laterRenderHtml = render(structuredClone(session));
    const chapterHeading = html.indexOf('<h2>The returned memory</h2>');
    const memory = html.indexOf('class="memory-flashback');
    const chapterProse = html.indexOf('You open your eyes.');
    const laterHeading = html.indexOf('<h2>The wall panel</h2>');

    expect(occurrences(html, 'class="memory-flashback"')).toBe(1);
    expect(chapterHeading).toBeLessThan(memory);
    expect(memory).toBeLessThan(chapterProse);
    expect(chapterProse).toBeLessThan(laterHeading);
    expect(occurrences(laterRenderHtml, 'class="memory-flashback"')).toBe(1);
    expect(laterRenderHtml).not.toContain('memory-flashback is-fresh');
  });
});

describe('agent handoff', () => {
  it('offers one short optional example before the first agent call', () => {
    const html = render(baseSession(), { agentActive: false });

    expect(html).toContain('Start with one move.');
    expect(html).toContain('Tell your agent what you do in one message.');
    expect(html).toContain('Copy this example');
    expect(html).toContain('Copying is optional');
    expect(html).toContain(experience.startMessage);
    expect(html).not.toContain('ChatGPT');
  });

  it('removes the handoff after the agent touches the page', () => {
    const html = render(baseSession());

    expect(html).toContain('What do you do?');
    expect(html).not.toContain('Copy this example');
  });

  it('offers a recovery message instead of claiming an absent agent is writing', () => {
    const html = render(pendingSession(), { agentActive: false });

    expect(html).toContain('Resume the unfinished chapter.');
    expect(html).toContain('Finish the saved turn first.');
    expect(html).not.toContain('class="writing-marker"');
    expect(html).not.toContain('ChatGPT');
  });

  it('offers a later resume message when agent tools are ready', () => {
    const resumed = render(committedSession(), { agentActive: false });

    expect(resumed).toContain('Continue with one move.');
    expect(resumed).toContain('Resume Memory test with me through this page.');
    expect(resumed).not.toContain('ChatGPT');
  });
});

describe('WebMCP availability', () => {
  it.each(['connecting', 'unsupported', 'disabled', 'error'] as const)(
    'replaces the ready turn with one quiet %s state',
    (status) => {
      const html = render(baseSession(), { agentActive: false, status });

      expect(occurrences(html, 'data-webmcp-availability')).toBe(1);
      expect(html).not.toContain('Your turn');
      expect(html).not.toContain('Need a hint?');
      expect(html).not.toContain('Copy this example');
      expect(html).not.toContain('role="alert"');
      expect(html).not.toContain('ChatGPT');
    },
  );

  it('explains unavailable WebMCP with the canonical specification link', () => {
    const html = render(baseSession(), {
      agentActive: false,
      status: 'unsupported',
    });

    expect(html).toContain('WebMCP isn&#x27;t available for this page');
    expect(html).toContain(
      'WebMCP lets your agent interact with this story through tools exposed by the page.',
    );
    expect(html).toContain(
      'href="https://webmachinelearning.github.io/webmcp/"',
    );
    expect(html).toContain('Learn about WebMCP');
  });

  it.each(['connecting', 'unsupported', 'disabled', 'error'] as const)(
    'replaces an awaiting chapter with one quiet %s state',
    (status) => {
      const html = render(pendingSession(), { status });

      expect(occurrences(html, 'data-webmcp-availability')).toBe(1);
      expect(html).not.toContain('Saved turn');
      expect(html).not.toContain('class="writing-marker"');
      expect(html).not.toContain('Copy this example');
    },
  );

  it('keeps a completed manuscript available without WebMCP', () => {
    const html = render(completeSession(), { status: 'unsupported' });

    expect(html).toContain('The manuscript rests.');
    expect(html).not.toContain('webmcp-availability');
  });
});

function render(
  session: ExperienceSession,
  options: {
    agentActive?: boolean;
    status?: 'connecting' | 'connected' | 'disabled' | 'unsupported' | 'error';
  } = {},
): string {
  return renderToStaticMarkup(
    createElement(StoryScroll, {
      agentActive: options.agentActive ?? true,
      experience,
      onAnnounce: () => undefined,
      onRetryConnection: () => undefined,
      session,
      webMCPStatus: options.status ?? 'connected',
    }),
  );
}

function pendingSession(): ExperienceSession {
  return {
    ...baseSession(),
    revision: 2,
    phase: 'AWAITING_CHAPTER',
    interactionUses: [
      {
        interactionId: 'north_station_memory',
        status: 'pending',
        invokedAt: 2,
        retiredAt: null,
        receiptId: effectReceipt.receiptId,
      },
    ],
    pendingTurn: {
      turnId: 'turn_memory',
      kind: 'interaction',
      playerChoice: 'I follow the announcement.',
      createdAt: 2,
      interactionId: 'north_station_memory',
      effectReceipt,
    },
  };
}

function committedSession(): ExperienceSession {
  return {
    ...baseSession(),
    revision: 4,
    phase: 'READY',
    chapters: [
      prologue,
      {
        id: 'chapter_memory',
        title: 'The returned memory',
        prose: 'You open your eyes.',
        createdAt: 3,
        turnId: 'turn_memory',
        discoveryIds: [],
        effectReceiptId: effectReceipt.receiptId,
      },
      {
        id: 'chapter_later',
        title: 'The wall panel',
        prose: 'The story continues.',
        createdAt: 4,
        turnId: 'turn_later',
        discoveryIds: [],
        effectReceiptId: null,
      },
    ],
    interactionUses: [
      {
        interactionId: 'north_station_memory',
        status: 'retired',
        invokedAt: 2,
        retiredAt: 3,
        receiptId: effectReceipt.receiptId,
      },
    ],
  };
}

function completeSession(): ExperienceSession {
  return { ...committedSession(), phase: 'COMPLETE' };
}

function baseSession(): ExperienceSession {
  return {
    experienceId: experience.id,
    storyId: experience.story.id,
    sessionId: 'session_memory',
    revision: 1,
    phase: 'READY',
    continuitySummary: 'The question waits.',
    chapters: [prologue],
    discoveries: [],
    facts: [
      {
        id: 'north_station_flashback',
        value: effectReceipt.facts[0]!.value,
        revealedByInteractionId: 'north_station_memory',
        revealedAt: 2,
      },
      {
        id: 'approved_north_station_account',
        value: effectReceipt.facts[1]!.value,
        revealedByInteractionId: 'north_station_memory',
        revealedAt: 2,
      },
    ],
    interactionUses: [],
    pendingTurn: null,
    operationLedger: [],
  };
}

function occurrences(value: string, needle: string): number {
  return value.split(needle).length - 1;
}
