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
      recordProse: 'The question waits.',
      continuitySummary: 'The question waits.',
    },
    completionPassage: {
      prose: 'You leave the room and keep walking.',
      recordProse: 'The subject leaves the room and continues walking.',
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
            recordValue: effectReceipt.facts[0]!.value,
            protectedTerms: [],
          },
          {
            id: 'approved_north_station_account',
            value: effectReceipt.facts[1]!.value,
            recordValue: effectReceipt.facts[1]!.value,
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
  recordProse: 'The question waits.',
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
    expect(html).not.toContain('The subject opens their eyes.');
  });
});

describe('agent handoff', () => {
  it('offers one short optional example before the first agent call', () => {
    const html = render(baseSession(), { agentActive: false });

    expect(html).toContain('The speaker is waiting.');
    expect(html).toContain(
      'Tell your agent what you inspect before you answer.',
    );
    expect(html).toContain('Copy example message');
    expect(html).toContain(experience.startMessage);
    expect(html).not.toContain('Room Seven');
    expect(html).not.toContain('the subject');
    expect(html).not.toContain('ChatGPT');
  });

  it('removes the handoff after the agent touches the page', () => {
    const html = render(baseSession());

    expect(html).toContain('What do you inspect first?');
    expect(html).not.toContain('Copy example message');
  });

  it('offers a recovery message instead of claiming an absent agent is writing', () => {
    const html = render(pendingSession(), { agentActive: false });

    expect(html).toContain('The page is unfinished.');
    expect(html).toContain(
      'Your move is already here. Ask your agent to finish the chapter.',
    );
    expect(html).toContain('Finish the saved turn first.');
    expect(html).not.toContain('class="writing-marker"');
    expect(html).not.toContain('ChatGPT');
  });

  it('offers a later resume message when agent tools are ready', () => {
    const resumed = render(committedSession(), { agentActive: false });

    expect(resumed).toContain('The room is waiting.');
    expect(resumed).toContain('Resume Memory test with me through this page.');
    expect(resumed).not.toContain('ChatGPT');
  });
});

describe('WebMCP availability', () => {
  it.each(['connecting', 'unsupported', 'disabled', 'error'] as const)(
    'replaces ready and awaiting turns with one quiet %s state',
    (status) => {
      const ready = render(baseSession(), { agentActive: false, status });
      const awaiting = render(pendingSession(), { status });

      for (const html of [ready, awaiting]) {
        expect(occurrences(html, 'data-webmcp-availability')).toBe(1);
        expect(html).toContain('inert=""');
        expect(html).toContain('data-navigation-disabled="true"');
        expect(html).not.toContain('id="your-turn"');
        expect(html).not.toContain('class="writing-marker"');
        expect(html).not.toContain('class="agent-handoff"');
        expect(html).not.toContain('role="alert"');
        expect(html).not.toContain('ChatGPT');
      }
    },
  );

  it('keeps the generic unsupported state short and non-actionable', () => {
    const html = render(baseSession(), {
      agentActive: false,
      status: 'unsupported',
    });
    const availability = availabilityMarkup(html);

    expect(availability).toContain('Access restricted');
    expect(availability).toContain('A WebMCP-enabled browser is required.');
    expect(availability).not.toContain('chrome://flags');
    expect(availability).not.toContain('href=');
    expect(availability).not.toContain('<button');
  });

  it('shows the bounded Chrome flag setup hint with one copy action', () => {
    const html = render(baseSession(), {
      agentActive: false,
      setupHint: 'chrome-flag',
      status: 'unsupported',
    });
    const availability = availabilityMarkup(html);

    expect(availability).toContain('Access restricted');
    expect(availability).toContain(
      '<code>chrome://flags/#enable-webmcp-testing</code>',
    );
    expect(availability).toContain('Enable the Chrome flag:');
    expect(availability).not.toContain('relaunch');
    expect(availability).toContain('aria-label="Copy Chrome flag"');
    expect(occurrences(availability, '<button')).toBe(1);
  });

  it('does not offer Check again when WebMCP is blocked', () => {
    const html = render(baseSession(), { status: 'disabled' });
    const availability = availabilityMarkup(html);

    expect(availability).toContain('Access restricted');
    expect(availability).toContain('WebMCP is blocked for this site.');
    expect(availability).not.toContain('Check again');
    expect(availability).not.toContain('<button');
  });

  it('keeps Try again only for a startup error', () => {
    const html = render(baseSession(), { status: 'error' });

    expect(html).toContain('Access interrupted');
    expect(html).toContain('WebMCP couldn’t start.');
    expect(html).toContain('>Try again</button>');
  });

  it('keeps a completed manuscript available without WebMCP', () => {
    const html = render(completeSession(), { status: 'unsupported' });

    expect(html).toContain(
      'The subject leaves the room and continues walking.',
    );
    expect(html).not.toContain('<del>');
    expect(html).not.toContain('<ins>');
    expect(html).not.toContain('record-revision');
    expect(html).toContain('You open your eyes.');
    expect(html).not.toContain('The subject opens their eyes.');
    expect(html).not.toContain('The manuscript rests.');
    expect(html).not.toContain('webmcp-availability');
    expect(html).toContain('Preparing a copy…');
    expect(html).toContain('Pass the manuscript on');
    expect(html).toContain(
      'Let someone else read what happened. This copy disappears in 30 days.',
    );
    expect(html).not.toContain('>Create link</button>');
    expect(html).not.toContain('>Share story</button>');
  });
});

function render(
  session: ExperienceSession,
  options: {
    agentActive?: boolean;
    setupHint?: 'chrome-flag' | 'generic';
    status?: 'connecting' | 'connected' | 'disabled' | 'unsupported' | 'error';
  } = {},
): string {
  return renderToStaticMarkup(
    createElement(StoryScroll, {
      agentActive: options.agentActive ?? true,
      experience,
      onAnnounce: () => undefined,
      onPageChange: () => undefined,
      onRetryConnection: () => undefined,
      session,
      webMCPSetupHint: options.setupHint ?? 'generic',
      webMCPStatus: options.status ?? 'connected',
    }),
  );
}

function availabilityMarkup(html: string): string {
  const start = html.indexOf('<section aria-labelledby="webmcp-');
  if (start < 0) return '';
  const end = html.indexOf('</section>', start);
  return html.slice(start, end + '</section>'.length);
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
        recordProse: 'The subject opens their eyes.',
        createdAt: 3,
        turnId: 'turn_memory',
        discoveryIds: [],
        effectReceiptId: effectReceipt.receiptId,
      },
      {
        id: 'chapter_later',
        title: 'The wall panel',
        prose: 'The story continues.',
        recordProse: 'The story continues.',
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
