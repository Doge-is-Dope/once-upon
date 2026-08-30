'use client';

import { useState } from 'react';
import type { ExperienceSession } from '@/lib/runtime/types';
import { WEBMCP_CLIENT_NAME } from '@/lib/webmcp/tools';
import { useBookUi } from './book-ui-context';
import { CopyButton } from './copy-button';
import { useExperience } from './experience-context';
import { NextMoves } from './next-moves';

// The opening card walks a new player across the page-plus-chat gap in three
// states: explain how the book works, wait for the agent to pick up the
// opening message, then hand over concrete first moves.
export function StartCard({ session }: { session: ExperienceSession }) {
  const { startMessage } = useExperience();
  const { agentActive } = useBookUi();
  const [copied, setCopied] = useState(false);

  if (agentActive)
    return (
      <div className="instruction-card start-card is-active">
        <p className="eyebrow">Your AI has opened the book</p>
        <h3>Tell it what you do first</h3>
        <p>
          Just describe it in the chat — &ldquo;I search the hearth.&rdquo;
        </p>
        <NextMoves session={session} />
      </div>
    );

  if (copied)
    return (
      <output className="instruction-card start-card is-waiting">
        <p className="eyebrow">Message copied</p>
        <h3>
          Waiting for your AI to open the book…
          <span className="writing-dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </h3>
        <p>
          Paste the message into the chat beside this page and send it. Keep
          this page open while you play.
        </p>
        <CopyButton text={startMessage} idleLabel="Copy it again" />
      </output>
    );

  return (
    <div className="instruction-card start-card">
      <p className="eyebrow">How this book works</p>
      <ol className="how-to-steps">
        <li>
          <strong>You say what you try</strong>
          <span>Type it in the chat beside this page.</span>
        </li>
        <li>
          <strong>The book rolls the dice</strong>
          <span>Your fate is decided and recorded right here.</span>
        </li>
        <li>
          <strong>{WEBMCP_CLIENT_NAME} writes the page</strong>
          <span>Every action fills one of the six pages.</span>
        </li>
      </ol>
      <CopyButton
        text={startMessage}
        idleLabel="Copy the opening message"
        onCopied={() => setCopied(true)}
      />
      <p className="chat-pointer">
        Paste it into the chat panel <span aria-hidden="true">→</span>
      </p>
    </div>
  );
}
