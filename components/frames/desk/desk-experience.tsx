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
import { DeskRail } from './desk-rail';
import { DeskScene } from './desk-scene';
import { StoryHeaderTitle } from './story-header-title';
import { StoryCluesTrigger } from './story-clues';
import { StoryHint } from './story-hint';
import { StorySettings } from './settings-panel';
import { StoryScroll } from './sheet';
import { useClueJournal } from './use-clue-journal';
import { useMediaQuery } from './use-media-query';
import { useSessionView } from './use-session-view';
import { useWebMCPConnection } from './use-webmcp-connection';
import type { WebMCPStatus } from '@/lib/webmcp/tools';

const DEBUG_MODE_STORAGE_KEY = 'once-upon:debug-mode';
const DEBUG_MODE_CHANGE_EVENT = 'once-upon:debug-mode-change';
// Wide enough for the record (48rem), the notebook (22rem) and the gutters
// between them; narrower desks float the notebook over the felt instead.
const DOCKED_RAIL_QUERY = '(min-width: 74rem)';
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
  const [typingActive, setTypingActive] = useState(false);
  const handleTypingChange = useCallback(
    (typing: boolean) => setTypingActive(typing),
    [],
  );
  const docked = useMediaQuery(DOCKED_RAIL_QUERY);
  const journal = useClueJournal(experience, session, {
    typingActive,
    onAnnounce: announce,
  });
  const acknowledgeClues = journal.acknowledge;
  const clueCount = journal.clues.length;
  const [cluesOpen, setCluesOpen] = useState(false);
  const handleCluesOpenChange = useCallback(
    (open: boolean) => {
      if (open) announce(`Notes opened. ${clueCount} found.`);
      else acknowledgeClues();
      setCluesOpen(open);
    },
    [acknowledgeClues, announce, clueCount],
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
  const copy = useMemo(() => resolveBookCopy(experience.frame), [experience]);
  const hint = resolveHint(experience, copy, session);
  const hintAvailable =
    hint !== null && webMCPStatus === 'connected' && !typingActive;
  return (
    <div
      className="frame-book"
      data-agent-active={agentActive || undefined}
      data-agent-running={activeTool ? 'true' : undefined}
      data-rail-open={(cluesOpen && !docked) || undefined}
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
          {!docked && (notesAvailable || debugMode) ? (
            <StoryCluesTrigger
              hasNewClues={journal.hasNewClues}
              onToggle={() => handleCluesOpenChange(!cluesOpen)}
              open={cluesOpen}
            />
          ) : null}
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
          <div className="title-block" data-visible>
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
        <div className="story-manuscript-stage">
          <div className="story-manuscript-content">
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
              pageNavigationEnabled
              onRetryConnection={handleRetryConnection}
              session={session}
              webMCPSetupHint={setupHint}
              webMCPStatus={webMCPStatus}
            />
          </div>
        </div>
        {/* The notebook sits beside the record, never over it or under
            it: reading and note-taking share one viewport. */}
        <DeskRail
          acknowledgedClueIds={journal.acknowledgedClueIds}
          activeTool={activeTool}
          clues={journal.clues}
          copy={copy}
          debugMode={debugMode}
          docked={docked}
          experience={experience}
          hasNewClues={journal.hasNewClues}
          notesAvailable={notesAvailable}
          onAcknowledge={acknowledgeClues}
          onOpenChange={handleCluesOpenChange}
          open={cluesOpen}
          session={session}
          webMCPStatus={webMCPStatus}
        />
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
