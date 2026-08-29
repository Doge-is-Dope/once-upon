'use client';

import { useRef } from 'react';
import type { ExperienceSession } from '@/lib/runtime/types';
import type { WebMCPStatus } from '@/lib/webmcp/tools';
import { useExperience } from '../experience-context';
import { LedgerDialog } from '../ledger-dialog';
import { ManuscriptBook } from '../manuscript-book';
import type { MotionCues, UnseenLedger } from '../session-cues';
import { ConnectionIssueNotice } from '../webmcp-notices';

export function GameScreen({
  title,
  session,
  webMCPStatus,
  recoveryReady,
  streamingEntryId,
  motionCues,
  unseen,
  fault,
  focusReaderToken,
  onDismissFault,
  onLedgerSeen,
  onRetryConnection,
  onStreamed,
  onConsumeMotion,
  onRestart,
}: {
  title: string;
  session: ExperienceSession;
  webMCPStatus: WebMCPStatus;
  recoveryReady: boolean;
  streamingEntryId: string | null;
  motionCues: MotionCues;
  unseen: UnseenLedger;
  fault: string;
  focusReaderToken: number;
  onDismissFault: () => void;
  onLedgerSeen: () => void;
  onRetryConnection: () => void;
  onStreamed: () => void;
  onConsumeMotion: () => void;
  onRestart: () => Promise<void>;
}) {
  const { story } = useExperience();
  const ledgerRef = useRef<HTMLDialogElement>(null);
  const unseenCount =
    unseen.inventoryIds.length +
    unseen.clueIds.length +
    unseen.abilityIds.length;
  return (
    <main
      className="game-shell"
      style={
        {
          '--midnight': session.clock / story.limits.maxClock,
        } as React.CSSProperties
      }
    >
      {fault ? (
        <output className="fault-banner">
          <span>{fault}</span>
          <button type="button" onClick={onDismissFault} aria-label="Dismiss">
            ×
          </button>
        </output>
      ) : null}
      <header className="game-header">
        <div>
          <p className="eyebrow">{title}</p>
          <h1>
            {session.character.name === 'the traveler'
              ? "The traveler's manuscript"
              : `${session.character.name}'s manuscript`}
          </h1>
        </div>
      </header>
      <ConnectionIssueNotice
        status={webMCPStatus}
        onRetry={onRetryConnection}
        compact
      />
      <div className="book-toolbar">
        <div className="status-strip" aria-label="Adventure status">
          <StatusValue
            label="Location"
            value={story.locationLabel(session.locationId)}
            emphasize={motionCues.locationId === session.locationId}
          />
          <StatusValue
            label="Clock"
            value={`${session.clock} / ${story.limits.maxClock}`}
            emphasize={motionCues.clock === session.clock}
          />
          <StatusValue
            label="Resolve"
            value={`${session.resolve} / ${story.limits.maxResolve}`}
            emphasize={motionCues.resolve === session.resolve}
          />
        </div>
        <button
          className="ledger-button"
          type="button"
          onClick={() => ledgerRef.current?.showModal()}
          aria-label={
            unseenCount > 0
              ? `Open ledger, ${unseenCount} new ${unseenCount === 1 ? 'entry' : 'entries'}`
              : undefined
          }
        >
          Open ledger
          {unseenCount > 0 ? (
            <span className="ledger-badge" aria-hidden="true">
              {unseenCount}
            </span>
          ) : null}
        </button>
      </div>
      <ManuscriptBook
        session={session}
        recoveryReady={recoveryReady}
        streamingEntryId={streamingEntryId}
        motionCues={motionCues}
        focusReaderToken={focusReaderToken}
        onStreamed={onStreamed}
        onConsumeMotion={onConsumeMotion}
        onRestart={onRestart}
      />
      <LedgerDialog
        ref={ledgerRef}
        session={session}
        unseen={unseen}
        onSeen={onLedgerSeen}
        onRestart={onRestart}
      />
    </main>
  );
}

function StatusValue({
  label,
  value,
  emphasize = false,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}) {
  return (
    <div className={`status-value${emphasize ? ' is-changed' : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
