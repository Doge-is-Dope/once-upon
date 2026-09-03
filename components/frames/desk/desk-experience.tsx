'use client';

import Image from 'next/image';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { resolveBookCopy } from '@/lib/frames/book';
import type { ExperienceController } from '@/lib/runtime/controller';
import { availableInteractions } from '@/lib/runtime/engine';
import type {
  BookFrameCopy,
  ExperienceDefinition,
  ExperienceSession,
} from '@/lib/runtime/types';
import { DeskScene } from './desk-scene';
import { StoryHeaderTitle } from './story-header-title';
import { StoryClues } from './story-clues';
import { StoryHint } from './story-hint';
import { StorySettings } from './settings-panel';
import { StoryScroll } from './sheet';
import { useSessionView } from './use-session-view';
import { useWebMCPConnection } from './use-webmcp-connection';
import type { WebMCPStatus } from '@/lib/webmcp/tools';
import { WebMCPInspector } from './tool-inspector';

const DEBUG_MODE_STORAGE_KEY = 'once-upon:debug-mode';
const DEBUG_MODE_CHANGE_EVENT = 'once-upon:debug-mode-change';
// How long a pending turn may sit with no tool activity before the page
// offers the reader a way to nudge their agent.
const QUIET_AGENT_MS = 45_000;
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

export function DeskExperience({
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
  const {
    webMCPStatus,
    setupHint,
    agentActive,
    activeTool,
    lastActivityAt,
    lastFailure,
    retryConnection,
  } = useWebMCPConnection(controller);
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

  const session = view.session;
  const handleRetryConnection = () => {
    announce('Reconnecting your agent…');
    retryConnection();
  };
  const storyStarted =
    session.pendingTurn !== null || session.chapters.length > 1;
  const notesAvailable = session.chapters.length > 1;
  const [cluesOpen, setCluesOpen] = useState(false);
  const [typingActive, setTypingActive] = useState(false);
  const handleTypingChange = useCallback(
    (typing: boolean) => setTypingActive(typing),
    [],
  );
  const agentQuiet = useQuietAgent(
    session.phase === 'AWAITING_CHAPTER' && activeTool === null,
    lastActivityAt ?? session.pendingTurn?.createdAt ?? null,
  );
  const showOpeningHero = !storyStarted;
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
  // The bulb stays in the header once the agent is connected; it only
  // lights while a move can be made and the page has finished writing.
  const copy = useMemo(() => resolveBookCopy(experience.frame), [experience]);
  const hint = resolveHint(experience, copy, session);
  const hintAvailable =
    hint !== null && webMCPStatus === 'connected' && !typingActive;
  return (
    <div
      className="frame-book"
      data-agent-active={agentActive || undefined}
      data-agent-running={activeTool ? 'true' : undefined}
      data-story-started={storyStarted || undefined}
      data-story-presentations={activePresentations.join(' ') || undefined}
      data-typing={typingActive || undefined}
    >
      <DeskScene />
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
          {webMCPStatus === 'connected' ? (
            <StoryHint
              disabled={!hintAvailable}
              hint={hint ?? 'A hint will appear when the record is ready.'}
            />
          ) : null}
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
        {showOpeningHero ? (
          <div className="title-block" data-visible inert={cluesOpen}>
            <div className="title-block-content">
              <h1>{experience.title}</h1>
              <p className="title-deck">
                Choose what you do. Your agent writes the next chapter. New
                discoveries unlock new actions.
              </p>
            </div>
          </div>
        ) : (
          <h1 className="sr-only">{experience.title}</h1>
        )}
        {/* The clue notebook hangs off the sheet's lower edge once there
            is a written chapter to take notes from; it never crowds the
            header and never lives inside the paginated flow. */}
        <div
          className="story-manuscript-stage"
          data-notes-available={notesAvailable || undefined}
        >
          {/* The open notebook sits in the top layer; the page beneath it
              goes inert while the notebook itself stays reachable. */}
          <div className="story-manuscript-content" inert={cluesOpen}>
            {/* Two earlier sheets under the record: the case file the
                bookmark is threaded through. */}
            <div aria-hidden="true" className="sheet-under sheet-under-b" />
            <div aria-hidden="true" className="sheet-under sheet-under-a" />
            <StoryScroll
              agentActive={agentActive}
              agentFailure={lastFailure}
              agentQuiet={agentQuiet}
              agentRunning={activeTool !== null}
              experience={experience}
              onAnnounce={announce}
              onTypingChange={handleTypingChange}
              pageNavigationEnabled={!cluesOpen}
              onRetryConnection={handleRetryConnection}
              session={session}
              webMCPSetupHint={setupHint}
              webMCPStatus={webMCPStatus}
            />
          </div>
          {notesAvailable ? (
            <StoryClues
              experience={experience}
              key={session.sessionId}
              onAnnounce={announce}
              onOpenChange={setCluesOpen}
              open={cluesOpen}
              session={session}
            />
          ) : null}
        </div>
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

// True once a pending turn has waited longer than QUIET_AGENT_MS with no
// tool activity; resets whenever the agent speaks again.
function useQuietAgent(pending: boolean, since: number | null): boolean {
  // Only the timer writes state; the flag is derived from whether the
  // deadline it recorded still matches the current wait.
  const [quietSince, setQuietSince] = useState<number | null>(null);
  useEffect(() => {
    if (!pending || since === null) return;
    const remaining = Math.max(0, QUIET_AGENT_MS - (Date.now() - since));
    const timer = window.setTimeout(() => setQuietSince(since), remaining);
    return () => window.clearTimeout(timer);
  }, [pending, since]);
  return pending && since !== null && quietSince === since;
}

function resolveHint(
  experience: ExperienceDefinition,
  copy: BookFrameCopy,
  session: ExperienceSession,
): string | null {
  if (session.phase !== 'READY') return null;
  const interaction = availableInteractions(experience, session)[0];
  if (interaction) return interaction.cue;
  return session.chapters.length === 1
    ? copy.hint.opening
    : copy.hint.continuing;
}

function connectionAnnouncement(status: WebMCPStatus): string {
  if (status === 'connected')
    return 'Your agent can now read and write this record.';
  if (status === 'disabled')
    return 'Your agent’s page tools are blocked for this site.';
  if (status === 'unsupported')
    return 'This browser cannot attach an agent to the page.';
  if (status === 'error') return 'The agent connection could not start.';
  return '';
}
