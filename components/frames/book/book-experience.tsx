'use client';

import Image from 'next/image';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ExperienceController } from '@/lib/runtime/controller';
import { availableInteractions } from '@/lib/runtime/engine';
import type {
  ExperienceDefinition,
  ExperienceSession,
} from '@/lib/runtime/types';
import { StoryHeaderTitle } from './story-header-title';
import { StoryHint } from './story-hint';
import { StorySettings } from './story-settings';
import { StoryScroll } from './story-scroll';
import { useLampLight } from './lamp-light';
import { useSessionView } from './use-session-view';
import { useWebMCPConnection } from './use-webmcp-connection';
import type { WebMCPStatus } from '@/lib/webmcp/tools';
import { WebMCPInspector } from './webmcp-inspector';

const DEBUG_MODE_STORAGE_KEY = 'once-upon:debug-mode';
const DEBUG_MODE_CHANGE_EVENT = 'once-upon:debug-mode-change';
let ephemeralDebugMode = false;

function subscribeToDebugMode(onStoreChange: () => void) {
  window.addEventListener('storage', onStoreChange);
  window.addEventListener(DEBUG_MODE_CHANGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener('storage', onStoreChange);
    window.removeEventListener(DEBUG_MODE_CHANGE_EVENT, onStoreChange);
  };
}

function readDebugMode() {
  try {
    return localStorage.getItem(DEBUG_MODE_STORAGE_KEY) === 'true';
  } catch {
    return ephemeralDebugMode;
  }
}

function writeDebugMode(enabled: boolean) {
  ephemeralDebugMode = enabled;
  try {
    localStorage.setItem(DEBUG_MODE_STORAGE_KEY, String(enabled));
  } catch {
    // Keep the setting for this visit even if it cannot be persisted.
  }
  window.dispatchEvent(new Event(DEBUG_MODE_CHANGE_EVENT));
}

export function BookExperience({
  controller,
  experience,
}: {
  controller: ExperienceController;
  experience: ExperienceDefinition;
}) {
  const debugMode = useSyncExternalStore(
    subscribeToDebugMode,
    readDebugMode,
    () => false,
  );
  const view = useSessionView(controller);
  const announce = view.announce;
  const { webMCPStatus, agentActive, activeTool, retryConnection } =
    useWebMCPConnection(controller);
  const announcedConnectionStatus = useRef<WebMCPStatus | null>(null);

  useEffect(() => {
    if (webMCPStatus === 'connecting') {
      announcedConnectionStatus.current = null;
      return;
    }
    if (announcedConnectionStatus.current === webMCPStatus) return;
    announcedConnectionStatus.current = webMCPStatus;
    announce(connectionAnnouncement(webMCPStatus));
  }, [announce, webMCPStatus]);

  const lampCanvasRef = useLampLight();
  const session = view.session;
  const handleRetryConnection = () => {
    announce('Preparing agent tools.');
    retryConnection();
  };
  const storyStarted =
    session.pendingTurn !== null || session.chapters.length > 1;
  const [currentPage, setCurrentPage] = useState(0);
  const showOpeningHero = !storyStarted && currentPage === 0;
  const usedInteractionIds = new Set(
    session.interactionUses.map(({ interactionId }) => interactionId),
  );
  const activePresentations = [
    ...new Set(
      experience.story.interactions
        .filter(({ id }) => usedInteractionIds.has(id))
        .map(({ presentation }) => String(presentation)),
    ),
  ];
  const hint = resolveHint(experience, session, webMCPStatus);
  return (
    <div
      className="frame-book"
      data-agent-active={agentActive || undefined}
      data-agent-running={activeTool ? 'true' : undefined}
      data-story-started={storyStarted || undefined}
      data-story-presentations={activePresentations.join(' ') || undefined}
    >
      <canvas className="lamp-canvas" aria-hidden="true" ref={lampCanvasRef} />
      <a className="skip-link" href="#manuscript-content">
        Skip to manuscript
      </a>
      <header className="story-header">
        <div className="story-header-brand">
          <Image
            alt="Once Upon"
            className="once-upon-mark"
            height={32}
            src="/logo-mark.svg"
            unoptimized
            width={32}
          />
          <StoryHeaderTitle title={experience.title} />
        </div>
        <div className="story-header-actions">
          {hint ? <StoryHint hint={hint} /> : null}
          <StorySettings
            debugMode={debugMode}
            onDebugModeChange={writeDebugMode}
          />
        </div>
      </header>
      <p className="sr-live" aria-live="polite" aria-atomic="true">
        {view.announcement}
      </p>
      <main className="story-shell" id="manuscript-content" tabIndex={-1}>
        {!showOpeningHero ? (
          <h1 className="sr-only">{experience.title}</h1>
        ) : null}
        <div
          aria-hidden={showOpeningHero ? undefined : true}
          className="title-block"
          data-visible={showOpeningHero || undefined}
        >
          <div className="title-block-content">
            <h1>{experience.title}</h1>
            <p className="title-deck">
              Read the page. Tell your agent what you do. Every discovery can
              give the page a new way to answer.
            </p>
          </div>
        </div>
        <StoryScroll
          agentActive={agentActive}
          experience={experience}
          onAnnounce={announce}
          onPageChange={setCurrentPage}
          onRetryConnection={handleRetryConnection}
          session={session}
          webMCPStatus={webMCPStatus}
        />
        {debugMode ? (
          <WebMCPInspector
            activeTool={activeTool}
            experience={experience}
            session={session}
            status={webMCPStatus}
          />
        ) : null}
      </main>
    </div>
  );
}

function resolveHint(
  experience: ExperienceDefinition,
  session: ExperienceSession,
  webMCPStatus: WebMCPStatus,
): string | null {
  if (session.phase !== 'READY' || webMCPStatus !== 'connected') return null;
  const interaction = availableInteractions(experience, session)[0];
  if (interaction) return interaction.cue;
  return session.chapters.length === 1
    ? 'Look closer at something already on the page, speak to someone, or test a way forward.'
    : 'Follow a detail from the latest chapter, revisit an earlier clue, or try something unexpected.';
}

function connectionAnnouncement(status: WebMCPStatus): string {
  if (status === 'connected')
    return 'Agent tools are ready. You can continue in one message.';
  if (status === 'disabled') return 'WebMCP tools are blocked for this page.';
  if (status === 'unsupported') return 'WebMCP is not available for this page.';
  if (status === 'error') return 'WebMCP could not start.';
  return '';
}
