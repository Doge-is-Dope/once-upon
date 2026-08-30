'use client';

import { useState } from 'react';
import type { ExperienceController } from '@/lib/runtime/controller';
import type { ExperienceDefinition } from '@/lib/runtime/types';
import { BookExperienceContext } from './experience-context';
import { BrowserPreview, SetupScreen } from './screens/setup-screen';
import { GameScreen } from './screens/game-screen';
import { useSessionView } from './use-session-view';
import { useWebMCPConnection } from './use-webmcp-connection';

export function BookExperience({
  controller,
  experience,
}: {
  controller: ExperienceController;
  experience: ExperienceDefinition;
}) {
  const view = useSessionView(controller, experience.story);
  const { webMCPStatus, agentActive, retryConnection } = useWebMCPConnection(
    controller,
    view.ready,
    view.error,
  );

  let content: React.ReactNode;
  if (!view.ready) content = <LoadingScreen />;
  else if (view.error)
    content = (
      <ErrorScreen
        title={experience.title}
        message={view.error}
        onRecover={async () => {
          await controller.recoverCorruptSave();
          window.location.reload();
        }}
      />
    );
  else if (!view.session && webMCPStatus === 'unsupported')
    content = <BrowserPreview title={experience.title} />;
  else if (!view.session)
    content = (
      <SetupScreen
        title={experience.title}
        onBegin={(name, specialty) => controller.begin(name, specialty)}
        webMCPStatus={webMCPStatus}
        onRetryConnection={retryConnection}
        autoFocusName={view.restartCount > 0}
      />
    );
  else
    content = (
      <>
        <p className="sr-live" aria-live="polite" aria-atomic="true">
          {view.announcement}
        </p>
        <GameScreen
          title={experience.title}
          session={view.session}
          webMCPStatus={webMCPStatus}
          agentActive={agentActive}
          recoveryReady={view.recoveryReady}
          streamingEntryId={view.streamingEntryId}
          motionCues={view.motionCues}
          unseen={view.unseen}
          fault={view.fault}
          focusReaderToken={view.focusReaderToken}
          onDismissFault={view.dismissFault}
          onLedgerSeen={view.markLedgerSeen}
          onRetryConnection={retryConnection}
          onStreamed={view.clearStreaming}
          onConsumeMotion={view.consumeMotion}
          onRestart={() => controller.restart()}
        />
      </>
    );

  return (
    <BookExperienceContext.Provider value={experience}>
      <div className="frame-book">{content}</div>
    </BookExperienceContext.Provider>
  );
}

function LoadingScreen() {
  return (
    <main className="loading-screen">
      <span className="seal" aria-hidden="true">
        M
      </span>
      <output>Opening the manuscript…</output>
    </main>
  );
}

function ErrorScreen({
  title,
  message,
  onRecover,
}: {
  title: string;
  message: string;
  onRecover: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <main className="message-screen">
      <p className="eyebrow">The manuscript stayed closed</p>
      <h1>{title}</h1>
      <p>{message}</p>
      <button
        className="copy-button recovery-button"
        type="button"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setFailed(false);
          void onRecover().catch(() => {
            setBusy(false);
            setFailed(true);
          });
        }}
      >
        {busy ? 'Preserving the old save…' : 'Begin a new manuscript'}
      </button>
      {failed ? (
        <p className="form-error" role="alert">
          The old save could not be moved aside. Clear this site&apos;s data in
          your browser, then reload.
        </p>
      ) : null}
    </main>
  );
}
