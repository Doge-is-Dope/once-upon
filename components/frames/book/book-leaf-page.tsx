'use client';

import { useEffect, useState } from 'react';
import type { CanonicalEvent, ExperienceSession } from '@/lib/runtime/types';
import { WEBMCP_CLIENT_NAME } from '@/lib/webmcp/tools';
import { CopyButton } from './copy-button';
import { useBookFrameCopy, useExperience } from './experience-context';
import { eventTypeLabel, titleCase } from './formatters';
import { formatPageNumber, narrationText, type BookLeaf } from './model';
import { AbilityCard, RollCard } from './roll-card';
import type { MotionCues } from './session-cues';
import { StreamingProse } from './streaming-prose';

export function BookLeafPage({
  leaf,
  session,
  recoveryReady,
  streamingEntryId,
  motionCues,
  isLatest,
  onReadBeginning,
  onStreamed,
  onRestart,
}: {
  leaf: BookLeaf;
  session: ExperienceSession;
  recoveryReady: boolean;
  streamingEntryId: string | null;
  motionCues: MotionCues;
  isLatest: boolean;
  onReadBeginning: () => void;
  onStreamed: () => void;
  onRestart: () => Promise<void>;
}) {
  const { story } = useExperience();
  const copy = useBookFrameCopy();
  if (leaf.kind === 'bookplate')
    return (
      <div className="bookplate-copy">
        <span className="bookplate-mark">M</span>
        <p>This manuscript belongs to</p>
        <h2>
          {session.character.name === copy.defaultProtagonist
            ? titleCase(copy.defaultProtagonist)
            : session.character.name}
        </h2>
        <dl>
          <div>
            <dt>Strength</dt>
            <dd>{titleCase(session.character.specialty)}</dd>
          </div>
          <div>
            <dt>Rule</dt>
            <dd>{copy.tagline}</dd>
          </div>
        </dl>
      </div>
    );

  if (leaf.kind === 'unwritten')
    return (
      <div
        className="unwritten-copy"
        aria-label={`Page ${formatPageNumber(leaf.turn!)}, unwritten`}
      >
        <span aria-hidden="true">{formatPageNumber(leaf.turn!)}</span>
        <p>This page has not been written yet.</p>
      </div>
    );

  if (leaf.kind === 'prologue')
    return (
      <div className="leaf-copy">
        <p className="entry-number">Prologue</p>
        <h2>{leaf.title}</h2>
        {leaf.entry ? (
          <p className="manuscript-prose">{narrationText(leaf.entry)}</p>
        ) : null}
        {isLatest && session.turn === 0 ? <StartCard /> : null}
      </div>
    );

  const resolution = leaf.resolution!;
  const isNewEntry = leaf.entry?.id === streamingEntryId;
  const isFreshDraft =
    leaf.kind === 'draft' &&
    resolution.resolutionId === motionCues.resolutionId;
  return (
    <div
      className={`leaf-copy ${leaf.kind === 'draft' ? 'draft-copy' : ''}`}
      data-leaf-kind={leaf.kind}
      data-new={isNewEntry || isFreshDraft ? 'true' : 'false'}
    >
      {leaf.endingId ? (
        <div className="ending-banner">
          <span>Manuscript sealed</span>
          <strong>{story.endingLabel(leaf.endingId)}</strong>
        </div>
      ) : null}
      <p className="entry-number">
        {leaf.kind === 'draft'
          ? `Draft Page ${formatPageNumber(leaf.turn!)}`
          : `Page ${formatPageNumber(leaf.turn!)}`}
      </p>
      <h2>{leaf.title}</h2>
      {leaf.kind === 'draft' ? (
        <blockquote className="player-intent">
          <small>Your action</small>
          <p>{resolution.intent}</p>
        </blockquote>
      ) : leaf.entry ? (
        <StreamingProse
          prose={narrationText(leaf.entry)}
          animate={isNewEntry}
          onStreamed={isNewEntry ? onStreamed : undefined}
        />
      ) : null}
      <RollCard
        resolution={resolution}
        settle={resolution.resolutionId === motionCues.resolutionId}
      />
      <MarginNotes events={leaf.notes} />
      {resolution.newAbilityIds.map((abilityId) => (
        <AbilityCard
          key={abilityId}
          abilityId={abilityId}
          celebrate={motionCues.abilityIds.includes(abilityId)}
        />
      ))}
      {leaf.kind === 'draft' && isLatest ? (
        <PendingCard
          session={session}
          recoveryReady={recoveryReady}
          fresh={resolution.resolutionId === motionCues.resolutionId}
        />
      ) : null}
      {leaf.kind === 'completed' && isLatest && !leaf.endingId ? (
        <div className="turn-card">
          <span className="turn-mark">→</span>
          <div>
            <strong>Your turn</strong>
            <p>Tell {WEBMCP_CLIENT_NAME} what you do next.</p>
          </div>
        </div>
      ) : null}
      {leaf.endingId ? (
        <div className="ending-actions">
          <p>The ink has dried. Your six pages rest safely on this device.</p>
          <div className="ending-buttons">
            <button type="button" onClick={onReadBeginning}>
              Read from the beginning
            </button>
            <RestartButton
              idleLabel="Begin a new manuscript"
              onRestart={onRestart}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function MarginNotes({ events }: { events: CanonicalEvent[] }) {
  if (!events.length) return null;
  return (
    <aside className="margin-notes" aria-label="What changed this turn">
      {events.map((event) => (
        <details className={`margin-note ${event.type}`} key={event.id}>
          <summary>
            <span>{eventTypeLabel(event.type)}</span>
            <strong>{event.label}</strong>
          </summary>
          <p>{event.detail}</p>
        </details>
      ))}
    </aside>
  );
}

export function RestartButton({
  idleLabel,
  onRestart,
}: {
  idleLabel: string;
  onRestart: () => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!confirming) return;
    const timer = window.setTimeout(() => setConfirming(false), 5_000);
    return () => window.clearTimeout(timer);
  }, [confirming]);
  return (
    <button
      className={`restart-button${confirming ? ' is-confirming' : ''}`}
      type="button"
      disabled={busy}
      onBlur={() => setConfirming(false)}
      onClick={() => {
        if (!confirming) {
          setConfirming(true);
          return;
        }
        setBusy(true);
        void onRestart().catch(() => setBusy(false));
      }}
    >
      {busy
        ? 'Closing the manuscript…'
        : confirming
          ? 'This erases this manuscript. Start anyway?'
          : idleLabel}
    </button>
  );
}

function StartCard() {
  const { startMessage } = useExperience();
  return (
    <div className="instruction-card">
      <p className="eyebrow">Start in the chat beside this page</p>
      <h3>Copy this message into the chat</h3>
      <p>Keep this page open while you play.</p>
      <p>
        Then just say what you do — &ldquo;I search the hearth.&rdquo; The book
        rolls; {WEBMCP_CLIENT_NAME} writes the page.
      </p>
      <CopyButton text={startMessage} idleLabel="Copy start message" />
    </div>
  );
}

function PendingCard({
  session,
  recoveryReady,
  fresh,
}: {
  session: ExperienceSession;
  recoveryReady: boolean;
  fresh: boolean;
}) {
  const { continueMessage } = useExperience();
  return (
    <output
      className={[
        'pending-card',
        fresh ? 'is-fresh' : '',
        recoveryReady ? 'is-recovering' : 'is-writing',
      ]
        .filter(Boolean)
        .join(' ')}
      data-fresh={fresh ? 'true' : 'false'}
    >
      <div className="pending-icon" aria-hidden="true">
        <span className="pending-nib">✎</span>
      </div>
      <div>
        <strong>Roll saved</strong>
        <p>
          {WEBMCP_CLIENT_NAME} is adding this turn to the manuscript…
          {!recoveryReady ? (
            <span className="writing-dots" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          ) : null}
        </p>
        <details className="recovery-details" open={recoveryReady}>
          <summary>Taking too long?</summary>
          <p>
            Your roll is safe. If {WEBMCP_CLIENT_NAME} stopped, copy this
            message and send it in the same chat.
          </p>
          <CopyButton
            text={continueMessage}
            idleLabel="Copy continue message"
          />
        </details>
        <small>
          Saved as the draft of Page{' '}
          {formatPageNumber(session.pendingResolution?.turn ?? 0)}
        </small>
      </div>
    </output>
  );
}
