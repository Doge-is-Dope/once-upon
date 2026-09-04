import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { StoryScroll } from '@/components/frames/desk/sheet';
import type {
  ExperienceSession,
  InteractionEffectReceipt,
  StoryChapter,
} from '@/lib/runtime/types';
import { deriveManuscriptReadModel } from '@/lib/manuscript/read-model';
import {
  fixtureAgentNotes,
  fixtureIds,
  fixtureProtectedTerms,
  recordFixtureExperience,
} from './support/fixture-story';

const { story } = recordFixtureExperience;
const memoryInteraction = story.interactions.find(
  ({ id }) => id === fixtureIds.interactions.memory,
)!;
const [memoryReturn, memorySecond] = memoryInteraction.sealedFacts;

const effectReceipt: InteractionEffectReceipt = {
  receiptId: 'effect_memory',
  interactionId: fixtureIds.interactions.memory,
  presentation: 'memory_flashback',
  factIds: [fixtureIds.facts.memoryReturn, fixtureIds.facts.memorySecond],
  facts: [
    { id: fixtureIds.facts.memoryReturn, value: memoryReturn!.value },
    { id: fixtureIds.facts.memorySecond, value: memorySecond!.value },
  ],
  createdAt: 2,
};

const prologue: StoryChapter = {
  id: 'chapter_prologue',
  title: story.prologue.title,
  prose: story.prologue.prose,
  recordProse: story.prologue.recordProse,
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
    expect(html.indexOf('class="memory-flashback')).toBeLessThan(
      html.indexOf('class="writing-marker"'),
    );
    expect(html).not.toContain('<dialog');
  });

  it('shows what the room does after the memory as a present-time return', () => {
    const html = render(pendingSession());

    // The second fact is on the page under its authored heading, after the
    // remembered scene and before the pending move.
    expect(occurrences(html, 'class="memory-return"')).toBe(1);
    expect(html).toContain('<p class="eyebrow">The voice</p>');
    expect(html).toContain(fixtureProtectedTerms.memorySecond);
    expect(html.indexOf('class="memory-flashback')).toBeLessThan(
      html.indexOf('class="memory-return"'),
    );
    expect(html.indexOf('class="memory-return"')).toBeLessThan(
      html.indexOf('class="writing-marker"'),
    );
    // The agent-only branch never reaches the page or its read model.
    expect(html).not.toContain(fixtureAgentNotes.memorySecond);
    expect(
      JSON.stringify(
        deriveManuscriptReadModel(recordFixtureExperience, committedSession()),
      ),
    ).not.toContain(fixtureAgentNotes.memorySecond);
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
    // The effect the reader already watched land keeps its place ahead of
    // the chapter heading that follows it.
    expect(memory).toBeLessThan(chapterHeading);
    expect(chapterHeading).toBeLessThan(chapterProse);
    expect(chapterProse).toBeLessThan(laterHeading);
    expect(occurrences(laterRenderHtml, 'class="memory-flashback"')).toBe(1);
    expect(laterRenderHtml).not.toContain('memory-flashback is-fresh');
    expect(html).not.toContain('The subject opens their eyes.');
  });
});

describe('agent handoff', () => {
  it('offers one short optional example before the first agent call', () => {
    const html = render(baseSession(), { agentActive: false });

    expect(html).toContain('The page is waiting.');
    expect(html).toContain(
      'No agent has spoken yet. Copy a starter message for your agent.',
    );
    expect(html).toContain('aria-label="Copy starter"');
    expect(html).toContain('class="copy-button handoff-copy-button"');
    expect(html).not.toContain('>Copy starter</button>');
    expect(html).not.toContain(recordFixtureExperience.startMessage);
    expect(html).not.toContain(fixtureProtectedTerms.panelTruth);
    expect(html).not.toContain('the subject');
    expect(html).not.toContain('ChatGPT');
  });

  it('removes the handoff after the agent touches the page', () => {
    const html = render(baseSession());

    expect(html).toContain('What do you do first?');
    expect(html).not.toContain('Copy starter');
  });

  it('offers a recovery message instead of claiming an absent agent is writing', () => {
    const html = render(pendingSession(), { agentActive: false });

    expect(html).toContain('The chapter is unwritten.');
    expect(html).toContain(
      'Your move is on the page but nothing followed it. Copy a message asking your agent to finish the saved turn.',
    );
    expect(html).not.toContain('Finish the saved turn first.');
    expect(html).toContain('class="pending-move"');
    expect(html).toContain(pendingSession().pendingTurn!.playerChoice);
    expect(html).not.toContain('class="writing-marker"');
    expect(html).not.toContain('ChatGPT');
  });

  it('offers a later resume message when agent tools are ready', () => {
    const resumed = render(committedSession(), { agentActive: false });

    expect(resumed).toContain('The page is waiting.');
    expect(resumed).toContain(
      'Your agent has not continued yet. Copy a message to resume.',
    );
    expect(resumed).toContain('Copy starter');
    expect(resumed).not.toContain(
      `Resume ${recordFixtureExperience.title} with me through this page.`,
    );
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

  it('keeps the generic unsupported state short, in-world, and non-actionable', () => {
    const html = render(baseSession(), {
      agentActive: false,
      status: 'unsupported',
    });
    const availability = availabilityMarkup(html);

    expect(availability).toContain('Access restricted');
    expect(availability).toContain(
      'This record can only be continued by an attached agent.',
    );
    expect(availability).not.toContain('WebMCP');
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

  it('keeps a blocked site short and non-actionable', () => {
    const html = render(baseSession(), { status: 'disabled' });
    const availability = availabilityMarkup(html);

    expect(availability).toContain('Access restricted');
    expect(availability).toContain('Page tools are blocked for this site.');
    expect(availability).not.toContain('WebMCP');
    expect(availability).not.toContain('<button');
  });

  it('keeps Try again for a startup error', () => {
    const html = render(baseSession(), { status: 'error' });

    expect(html).toContain('Access interrupted');
    expect(html).toContain('The connection to your agent did not start.');
    expect(html).toContain('>Try again</button>');
  });

  it('never stamps the slip while still checking', () => {
    const html = render(baseSession(), { status: 'connecting' });
    const availability = availabilityMarkup(html);

    expect(availability).toContain('webmcp-availability-connecting');
    expect(availability).toContain('Checking access…');
    expect(availability).not.toContain('<button');
  });

  it('censors the sheet in place while the gate is up', () => {
    // The fixture prologue has three paragraphs: the voice's question
    // stays legible, the second keeps its first four words, the last is
    // inked over entirely.
    const session = baseSession();
    const [question, desk, click] = paragraphsOf(story.prologue.prose);
    const visibleLead = 'The question wakes you ';
    expect(desk!.startsWith(visibleLead)).toBe(true);

    const restricted = render(session, {
      agentActive: false,
      status: 'unsupported',
    });
    expect(restricted).toContain('data-restricted="unsupported"');
    expect(restricted).not.toContain('webmcp-redaction');
    expect(occurrences(restricted, 'class="redacted-run"')).toBe(2);
    expect(restricted).toContain(`<p>${question}</p>`);
    expect(restricted).toContain(
      `<p>${visibleLead}<span class="redacted-run">${desk!.slice(visibleLead.length)}</span></p>`,
    );
    expect(restricted).toContain(
      `<p><span class="redacted-run">${click}</span></p>`,
    );

    const open = render(session);
    expect(open).not.toContain('data-restricted');
    expect(open).not.toContain('redacted-run');
  });

  it('keeps a completed manuscript available without WebMCP', () => {
    const html = render(completeSession(), { status: 'unsupported' });
    const recordEnding = paragraphsOf(story.completionPassage.recordProse!).at(
      -1,
    )!;

    expect(recordEnding).toContain('The subject continues walking.');
    expect(html).toContain(recordEnding);
    // Both versions of the ending are kept hidden so the last paragraph
    // reserves its taller height; only the record wording is readable.
    expect(occurrences(html, 'class="completion-ending-sizer"')).toBe(2);
    expect(html).toContain(
      `<span class="completion-ending-text">${recordEnding}</span>`,
    );
    expect(html).not.toContain('<del>');
    expect(html).not.toContain('<ins>');
    expect(html).not.toContain('record-revision');
    expect(html).toContain('You open your eyes.');
    expect(html).not.toContain('The subject opens their eyes.');
    expect(html).not.toContain('The manuscript rests.');
    expect(html).not.toContain('webmcp-availability');
    expect(html).toContain('Pass the manuscript on');
    expect(html).toContain('The link expires in 30 days.');
    // The copy is prepared on its own once the ending settles.
    expect(html).toContain('Preparing a copy…');
    expect(html).not.toContain('>Create a link</button>');
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
      experience: recordFixtureExperience,
      onAnnounce: () => undefined,
      pageNavigationEnabled: true,
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

function paragraphsOf(text: string): string[] {
  return text.split(/\n\s*\n/);
}

function pendingSession(): ExperienceSession {
  return {
    ...baseSession(),
    revision: 2,
    phase: 'AWAITING_CHAPTER',
    interactionUses: [
      {
        interactionId: fixtureIds.interactions.memory,
        status: 'pending',
        invokedAt: 2,
        retiredAt: null,
        receiptId: effectReceipt.receiptId,
      },
    ],
    pendingTurn: {
      turnId: 'turn_memory',
      kind: 'interaction',
      playerChoice: 'I close my eyes and begin with the bell.',
      createdAt: 2,
      interactionId: fixtureIds.interactions.memory,
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
        interactionId: fixtureIds.interactions.memory,
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
    experienceId: recordFixtureExperience.id,
    storyId: story.id,
    sessionId: 'session_memory',
    revision: 1,
    phase: 'READY',
    continuitySummary: story.prologue.continuitySummary,
    chapters: [prologue],
    discoveries: [],
    facts: [
      {
        id: fixtureIds.facts.memoryReturn,
        value: memoryReturn!.value,
        revealedByInteractionId: fixtureIds.interactions.memory,
        revealedAt: 2,
      },
      {
        id: fixtureIds.facts.memorySecond,
        value: memorySecond!.value,
        revealedByInteractionId: fixtureIds.interactions.memory,
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
