'use client';

import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import {
  buildBookLeaves,
  formatPageNumber,
  latestBookLeafIndex,
  narrationText,
  type BookLeaf,
} from '@/components/frames/book/model';
import type { ExperienceController } from '@/lib/runtime/controller';
import type {
  Affordance,
  CanonicalEvent,
  ExperienceDefinition,
  ExperienceSession,
  StoryDefinition,
  TurnResolution,
} from '@/lib/runtime/types';
import { registerExperienceTools, type WebMCPStatus } from '@/lib/webmcp/tools';

const CHROME_WEBMCP_FLAG = 'chrome://flags/#enable-webmcp-testing';

const BookExperienceContext = createContext<ExperienceDefinition | null>(null);

function useExperience(): ExperienceDefinition {
  const experience = useContext(BookExperienceContext);
  if (!experience)
    throw new Error('Book frame components need a BookExperienceContext.');
  return experience;
}

type MotionCues = {
  resolutionId: string | null;
  clock: number | null;
  resolve: number | null;
  locationId: ExperienceSession['locationId'] | null;
  inventoryIds: string[];
  clueIds: string[];
  abilityIds: ExperienceSession['unlockedAbilityIds'];
};

const EMPTY_MOTION_CUES: MotionCues = {
  resolutionId: null,
  clock: null,
  resolve: null,
  locationId: null,
  inventoryIds: [],
  clueIds: [],
  abilityIds: [],
};

type UnseenLedger = {
  clock: number | null;
  inventoryIds: string[];
  clueIds: string[];
  abilityIds: ExperienceSession['unlockedAbilityIds'];
};

const EMPTY_UNSEEN: UnseenLedger = {
  clock: null,
  inventoryIds: [],
  clueIds: [],
  abilityIds: [],
};

export function BookExperience({
  controller,
  experience,
}: {
  controller: ExperienceController;
  experience: ExperienceDefinition;
}) {
  const [session, setSession] = useState<ExperienceSession | null>(null);
  const [ready, setReady] = useState(false);
  const [webMCPStatus, setWebMCPStatus] = useState<WebMCPStatus>('connecting');
  const [error, setError] = useState('');
  const [fault, setFault] = useState('');
  const [connectAttempt, setConnectAttempt] = useState(0);
  const [recoveryReady, setRecoveryReady] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [streamingEntryId, setStreamingEntryId] = useState<string | null>(null);
  const [motionCues, setMotionCues] = useState<MotionCues>(EMPTY_MOTION_CUES);
  const [unseen, setUnseen] = useState<UnseenLedger>(EMPTY_UNSEEN);
  const [focusReaderToken, setFocusReaderToken] = useState(0);
  const [restartCount, setRestartCount] = useState(0);
  const lastRevision = useRef<number | null>(null);
  const lastNarrationLength = useRef<number | null>(null);
  const previousSession = useRef<ExperienceSession | null | undefined>(
    undefined,
  );

  useEffect(() => {
    let disposed = false;
    const unsubscribeFaults = controller.subscribeToFaults((message) => {
      if (!disposed) setFault(message);
    });
    const unsubscribe = controller.subscribe((next) => {
      if (disposed) return;
      const previous = previousSession.current;
      setSession(next ? structuredClone(next) : null);
      if (next && previous === null) setFocusReaderToken((token) => token + 1);
      if (!next && previous) setRestartCount((count) => count + 1);
      if (!next) setUnseen(EMPTY_UNSEEN);
      if (next && previous) {
        const isNewRevision = next.revision > previous.revision;
        const nextResolutionId = next.pendingResolution?.resolutionId ?? null;
        const previousResolutionId =
          previous.pendingResolution?.resolutionId ?? null;
        const newInventoryIds = isNewRevision
          ? next.inventoryIds.filter(
              (id) => !previous.inventoryIds.includes(id),
            )
          : [];
        const newClueIds = isNewRevision
          ? next.clueIds.filter((id) => !previous.clueIds.includes(id))
          : [];
        const newAbilityIds = isNewRevision
          ? next.unlockedAbilityIds.filter(
              (id) => !previous.unlockedAbilityIds.includes(id),
            )
          : [];
        setMotionCues({
          resolutionId:
            isNewRevision &&
            nextResolutionId &&
            nextResolutionId !== previousResolutionId
              ? nextResolutionId
              : null,
          clock:
            isNewRevision && next.clock > previous.clock ? next.clock : null,
          resolve:
            isNewRevision && next.resolve < previous.resolve
              ? next.resolve
              : null,
          locationId:
            isNewRevision && next.locationId !== previous.locationId
              ? next.locationId
              : null,
          inventoryIds: newInventoryIds,
          clueIds: newClueIds,
          abilityIds: newAbilityIds,
        });
        if (isNewRevision) {
          setUnseen((current) => ({
            clock: next.clock > previous.clock ? next.clock : current.clock,
            inventoryIds: [
              ...new Set([...current.inventoryIds, ...newInventoryIds]),
            ],
            clueIds: [...new Set([...current.clueIds, ...newClueIds])],
            abilityIds: [...new Set([...current.abilityIds, ...newAbilityIds])],
          }));
        }
      } else {
        setMotionCues(EMPTY_MOTION_CUES);
      }
      const nextNarrationLength = next?.narrationEntries.length ?? 0;
      const newestEntry = next?.narrationEntries.at(-1);
      if (
        lastNarrationLength.current !== null &&
        nextNarrationLength > lastNarrationLength.current &&
        newestEntry &&
        newestEntry.turn > 0
      ) {
        setStreamingEntryId(newestEntry.id);
      }
      lastNarrationLength.current = nextNarrationLength;
      if (!next?.pendingResolution) setRecoveryReady(false);
      if (
        next &&
        lastRevision.current !== null &&
        next.revision !== lastRevision.current
      ) {
        setAnnouncement(statusAnnouncement(next, experience.story));
        setFault('');
      }
      lastRevision.current = next?.revision ?? null;
      previousSession.current = next ? structuredClone(next) : null;
    });
    void controller
      .initialize()
      .then((saved) => {
        if (disposed) return;
        if (saved?.pendingResolution) setRecoveryReady(true);
        setReady(true);
      })
      .catch((reason: unknown) => {
        console.error(reason);
        if (!disposed) {
          setError(
            reason instanceof Error && reason.message.startsWith('SAVE_CORRUPT')
              ? 'The saved manuscript could not be read. The old pages are kept safe; you can begin a new one.'
              : 'The manuscript could not be opened on this device.',
          );
          setReady(true);
        }
      });
    return () => {
      disposed = true;
      unsubscribe();
      unsubscribeFaults();
    };
  }, [controller, experience.story]);

  useEffect(() => {
    if (!ready || error) return;
    let disposed = false;
    let unregisterTools: (() => void) | undefined;
    void registerExperienceTools(controller, (status) => {
      if (!disposed) setWebMCPStatus(status);
    }).then((cleanup) => {
      if (disposed) cleanup();
      else unregisterTools = cleanup;
    });
    return () => {
      disposed = true;
      unregisterTools?.();
    };
  }, [controller, ready, error, connectAttempt]);

  useEffect(() => {
    if (!session?.pendingResolution || recoveryReady) return;
    const age = Date.now() - session.pendingResolution.createdAt;
    const timer = window.setTimeout(
      () => setRecoveryReady(true),
      Math.max(0, 20_000 - age),
    );
    return () => window.clearTimeout(timer);
  }, [session?.pendingResolution, recoveryReady]);

  const retryConnection = () => setConnectAttempt((attempt) => attempt + 1);

  let content: React.ReactNode;
  if (!ready) content = <LoadingScreen />;
  else if (error)
    content = (
      <ErrorScreen
        title={experience.title}
        message={error}
        onRecover={async () => {
          await controller.recoverCorruptSave();
          window.location.reload();
        }}
      />
    );
  else if (!session && webMCPStatus === 'unsupported')
    content = <BrowserPreview title={experience.title} />;
  else if (!session)
    content = (
      <SetupScreen
        title={experience.title}
        onBegin={(name, specialty) => controller.begin(name, specialty)}
        webMCPStatus={webMCPStatus}
        onRetryConnection={retryConnection}
        autoFocusName={restartCount > 0}
      />
    );
  else
    content = (
      <>
        <p className="sr-live" aria-live="polite" aria-atomic="true">
          {announcement}
        </p>
        <GameScreen
          title={experience.title}
          session={session}
          webMCPStatus={webMCPStatus}
          recoveryReady={recoveryReady}
          streamingEntryId={streamingEntryId}
          motionCues={motionCues}
          unseen={unseen}
          fault={fault}
          focusReaderToken={focusReaderToken}
          onDismissFault={() => setFault('')}
          onLedgerSeen={() => setUnseen(EMPTY_UNSEEN)}
          onRetryConnection={retryConnection}
          onStreamed={() => setStreamingEntryId(null)}
          onConsumeMotion={() =>
            setMotionCues((cues) => ({
              ...cues,
              resolutionId: null,
              abilityIds: [],
            }))
          }
          onRestart={() => controller.restart()}
        />
      </>
    );

  return (
    <BookExperienceContext.Provider value={experience}>
      {content}
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

function SetupScreen({
  title,
  onBegin,
  webMCPStatus,
  onRetryConnection,
  autoFocusName,
}: {
  title: string;
  onBegin: (name: string, specialty: string) => Promise<unknown>;
  webMCPStatus: WebMCPStatus;
  onRetryConnection: () => void;
  autoFocusName: boolean;
}) {
  const { story } = useExperience();
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocusName) nameRef.current?.focus();
  }, [autoFocusName]);
  return (
    <main className="cover-shell">
      <section className="cover-panel" aria-labelledby="game-title">
        <p className="platform-mark">Once Upon presents</p>
        <p className="eyebrow">Six pages before midnight</p>
        <h1 id="game-title">{title}</h1>
        <p className="lede">A mystery you play with your AI.</p>
        <p className="sublede">
          You choose. The book rolls the dice. Your AI writes what happens.
        </p>
        {webMCPStatus === 'connected' ? (
          <form
            className="character-form"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              setBusy(true);
              setFormError('');
              const nameValue = data.get('characterName');
              const strengthValue = data.get('strength');
              const name = typeof nameValue === 'string' ? nameValue : '';
              const specialty = story.attributes.some(
                (attribute) => attribute.id === strengthValue,
              )
                ? (strengthValue as string)
                : story.attributes[0].id;
              void onBegin(name, specialty)
                .catch(() =>
                  setFormError(
                    'The manuscript could not be saved on this device. Private browsing or full storage can cause this.',
                  ),
                )
                .finally(() => setBusy(false));
            }}
          >
            <label htmlFor="character-name">Your character&apos;s name</label>
            <input
              id="character-name"
              name="characterName"
              autoComplete="off"
              placeholder="Optional"
              maxLength={40}
              ref={nameRef}
            />
            <p className="field-note">Leave blank to play as the traveler.</p>
            <fieldset>
              <legend>Choose one strength</legend>
              <p className="field-note">You can still use the others.</p>
              <div className="strength-grid">
                {story.attributes.map((attribute, index) => (
                  <label
                    className="strength-card"
                    aria-label={`${attribute.label}: ${attribute.description}`}
                    key={attribute.id}
                  >
                    <input
                      type="radio"
                      name="strength"
                      value={attribute.id}
                      defaultChecked={index === 0}
                    />
                    <span className="strength-copy">
                      <strong>{attribute.label}</strong>
                      <span>{attribute.description}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <StartButton busy={busy} submit />
            {formError ? (
              <p className="form-error" role="alert">
                {formError}
              </p>
            ) : null}
          </form>
        ) : (
          <ConnectionIssueNotice
            status={webMCPStatus}
            onRetry={onRetryConnection}
          />
        )}
      </section>
      <StoryPreview />
    </main>
  );
}

function BrowserPreview({ title }: { title: string }) {
  return (
    <main className="cover-shell preview-mode">
      <section className="cover-panel" aria-labelledby="preview-title">
        <p className="platform-mark">Once Upon presents</p>
        <p className="eyebrow">Six pages before midnight</p>
        <h1 id="preview-title">{title}</h1>
        <p className="lede">A mystery you play with your AI.</p>
        <p className="sublede">
          Open this page in a WebMCP-enabled AI browser to play.
        </p>
        <StartButton unavailableMessage="WebMCP isn't available in this browser." />
      </section>
      <StoryPreview />
    </main>
  );
}

function StoryPreview() {
  const [page, setPage] = useState(0);
  return (
    <aside className="preview-book" aria-label="Sample manuscript">
      <p className="preview-label">Sample leaves</p>
      <div className="book-spread preview-spread">
        <BookSurface side="left">
          {page === 0 ? (
            <div className="bookplate-copy">
              <span className="bookplate-mark">M</span>
              <p>This manuscript belongs to</p>
              <h2>The traveler</h2>
              <small>Six pages before midnight</small>
            </div>
          ) : (
            <PreviewStoryPage turn={1} />
          )}
        </BookSurface>
        <BookSurface side="right">
          {page === 0 ? (
            <div className="leaf-copy">
              <p className="entry-number">Prologue</p>
              <h2>The tavern before dawn</h2>
              <p className="manuscript-prose">
                The traveler woke beside a dying hearth. A raven watched from
                the rafters while something beneath the floor answered the
                clock.
              </p>
            </div>
          ) : (
            <div className="unwritten-copy" aria-label="Unwritten sample page">
              <span aria-hidden="true">Ⅱ</span>
              <p>This page has not been written yet.</p>
            </div>
          )}
        </BookSurface>
      </div>
      <nav className="book-navigation" aria-label="Sample page navigation">
        <button
          type="button"
          disabled={page === 0}
          onClick={() => setPage(0)}
          aria-label="Previous sample pages"
        >
          ←
        </button>
        <span>{page + 1} / 2</span>
        <button
          type="button"
          disabled={page === 1}
          onClick={() => setPage(1)}
          aria-label="Next sample pages"
        >
          →
        </button>
      </nav>
    </aside>
  );
}

function StartButton({
  busy = false,
  submit = false,
  unavailableMessage,
}: {
  busy?: boolean;
  submit?: boolean;
  unavailableMessage?: string;
}) {
  const tooltipId = useId();
  const unavailable = Boolean(unavailableMessage);
  return (
    <div className={`start-control${unavailable ? ' is-unavailable' : ''}`}>
      {unavailableMessage ? (
        <StartTooltip id={tooltipId} message={unavailableMessage} />
      ) : null}
      <button
        aria-describedby={unavailable ? tooltipId : undefined}
        className="primary-button"
        disabled={busy || unavailable}
        type={submit ? 'submit' : 'button'}
      >
        {busy ? 'Opening the manuscript…' : 'Start'}
      </button>
    </div>
  );
}

function StartTooltip({ id, message }: { id: string; message: string }) {
  return (
    <span className="start-tooltip" id={id} role="tooltip">
      {message}
    </span>
  );
}

function PreviewStoryPage({ turn }: { turn: number }) {
  const resolution = sampleResolution();
  return (
    <div className="leaf-copy">
      <p className="entry-number">Page {formatPageNumber(turn)}</p>
      <h2>A key in the ashes</h2>
      <p className="manuscript-prose">
        The traveler sifted the cold hearth. Beneath the ash, a blackened key
        still held the warmth of a hand that had vanished years ago.
      </p>
      <RollCard resolution={resolution} settle />
      <MarginNotes
        events={[
          {
            id: 'sample-key',
            type: 'item',
            label: 'Charred Key',
            detail: 'A warm key surfaced from beneath the hearth.',
          },
        ]}
      />
    </div>
  );
}

function GameScreen({
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

function ManuscriptBook({
  session,
  recoveryReady,
  streamingEntryId,
  motionCues,
  focusReaderToken,
  onStreamed,
  onConsumeMotion,
  onRestart,
}: {
  session: ExperienceSession;
  recoveryReady: boolean;
  streamingEntryId: string | null;
  motionCues: MotionCues;
  focusReaderToken: number;
  onStreamed: () => void;
  onConsumeMotion: () => void;
  onRestart: () => Promise<void>;
}) {
  const { story } = useExperience();
  const leaves = buildBookLeaves(session, story.limits.maxTurns);
  const latestLeaf = latestBookLeafIndex(session, story.limits.maxTurns);
  const singlePage = useSinglePage();
  const [activeLeaf, setActiveLeaf] = useState(latestLeaf);
  const [followingLatest, setFollowingLatest] = useState(true);
  const [newPageReady, setNewPageReady] = useState(false);
  const [turnOverlay, setTurnOverlay] = useState<{
    indices: number[];
    direction: 'forward' | 'back';
    backIndex: number;
  } | null>(null);
  const previousLatest = useRef(latestLeaf);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const animationTimer = useRef<number | null>(null);
  const readerRef = useRef<HTMLElement>(null);
  const spreadRef = useRef<HTMLDivElement>(null);

  const unit = singlePage ? activeLeaf : Math.floor(activeLeaf / 2);
  const maxUnit = singlePage ? latestLeaf : Math.floor(latestLeaf / 2);
  const visibleIndices = singlePage ? [activeLeaf] : [unit * 2, unit * 2 + 1];

  const clearOverlay = () => {
    if (animationTimer.current !== null)
      window.clearTimeout(animationTimer.current);
    animationTimer.current = null;
    spreadRef.current?.style.removeProperty('min-height');
    setTurnOverlay(null);
  };

  // Lock the spread's height while the leaf underneath swaps, so the
  // navigation bar does not jump at the start of a turn.
  const startTurnAnimation = (
    indices: number[],
    direction: 'forward' | 'back',
    backIndex: number,
  ) => {
    if (animationTimer.current !== null)
      window.clearTimeout(animationTimer.current);
    const spread = spreadRef.current;
    if (spread) spread.style.minHeight = `${spread.offsetHeight}px`;
    setTurnOverlay({ indices, direction, backIndex });
    animationTimer.current = window.setTimeout(clearOverlay, 700);
  };

  const turnTo = (targetLeaf: number, direction?: 'forward' | 'back') => {
    const safeTarget = Math.max(0, Math.min(latestLeaf, targetLeaf));
    const oldUnit = singlePage ? activeLeaf : Math.floor(activeLeaf / 2);
    const nextUnit = singlePage ? safeTarget : Math.floor(safeTarget / 2);
    if (oldUnit === nextUnit && safeTarget === activeLeaf) return;
    onConsumeMotion();
    const reduceMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    if (turnOverlay) clearOverlay();
    if (oldUnit !== nextUnit && !reduceMotion) {
      const turnDirection =
        direction ?? (nextUnit > oldUnit ? 'forward' : 'back');
      // The back of the turning sheet is the destination page it lands on.
      const backIndex = singlePage
        ? safeTarget
        : turnDirection === 'forward'
          ? nextUnit * 2
          : nextUnit * 2 + 1;
      startTurnAnimation(visibleIndices, turnDirection, backIndex);
    }
    setActiveLeaf(safeTarget);
    const atLatest = nextUnit === maxUnit;
    setFollowingLatest(atLatest);
    if (atLatest) setNewPageReady(false);
  };

  useEffect(() => {
    if (latestLeaf <= previousLatest.current) {
      previousLatest.current = latestLeaf;
      return;
    }
    if (followingLatest) {
      const oldUnit = singlePage ? activeLeaf : Math.floor(activeLeaf / 2);
      const nextUnit = singlePage ? latestLeaf : Math.floor(latestLeaf / 2);
      if (oldUnit !== nextUnit) {
        const reduceMotion = window.matchMedia(
          '(prefers-reduced-motion: reduce)',
        ).matches;
        if (!reduceMotion)
          startTurnAnimation(
            visibleIndices,
            'forward',
            singlePage ? latestLeaf : nextUnit * 2,
          );
      }
      setActiveLeaf(latestLeaf);
    } else {
      setNewPageReady(true);
    }
    previousLatest.current = latestLeaf;
    // This effect responds only to a newly created leaf.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestLeaf]);

  useEffect(() => {
    if (focusReaderToken > 0) readerRef.current?.focus();
  }, [focusReaderToken]);

  useEffect(
    () => () => {
      if (animationTimer.current !== null)
        window.clearTimeout(animationTimer.current);
    },
    [],
  );

  const move = (delta: -1 | 1) => {
    const target = singlePage
      ? activeLeaf + delta
      : Math.max(0, (unit + delta) * 2);
    turnTo(target, delta > 0 ? 'forward' : 'back');
  };

  return (
    <section className="book-reader-shell" aria-label="Manuscript reader">
      {newPageReady ? (
        <button
          className="new-page-bookmark"
          type="button"
          onClick={() => {
            turnTo(latestLeaf, 'forward');
            readerRef.current?.focus();
          }}
        >
          New page ready
        </button>
      ) : null}
      {/* This composite reader deliberately takes focus for arrow-key paging. */}
      {/* oxlint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */}
      <section
        className="book-reader"
        aria-label="Book pages. Use left and right arrow keys to turn pages."
        tabIndex={0}
        ref={readerRef}
        onKeyDown={(event) => {
          if (isInteractiveTarget(event.target)) return;
          if (event.key === 'ArrowLeft') {
            event.preventDefault();
            move(-1);
          }
          if (event.key === 'ArrowRight') {
            event.preventDefault();
            move(1);
          }
        }}
        onPointerDown={(event) => {
          if (
            (event.pointerType !== 'touch' && event.pointerType !== 'pen') ||
            isInteractiveTarget(event.target) ||
            event.clientX < 24 ||
            event.clientX > window.innerWidth - 24
          ) {
            pointerStart.current = null;
            return;
          }
          pointerStart.current = { x: event.clientX, y: event.clientY };
        }}
        onPointerUp={(event) => {
          const start = pointerStart.current;
          pointerStart.current = null;
          if (!start) return;
          const dx = event.clientX - start.x;
          const dy = event.clientY - start.y;
          if (Math.abs(dx) >= 56 && Math.abs(dx) > Math.abs(dy) * 1.4)
            move(dx < 0 ? 1 : -1);
        }}
      >
        <div
          className="book-spread"
          data-layout={singlePage ? 'single' : 'spread'}
          ref={spreadRef}
        >
          {visibleIndices.map((index, position) => (
            <BookSurface
              key={`${leaves[index].key}-${index}`}
              side={singlePage ? 'single' : position === 0 ? 'left' : 'right'}
            >
              <BookLeafPage
                leaf={leaves[index]}
                session={session}
                recoveryReady={recoveryReady}
                streamingEntryId={streamingEntryId}
                motionCues={motionCues}
                isLatest={index === latestLeaf}
                onReadBeginning={() => turnTo(0, 'back')}
                onStreamed={onStreamed}
                onRestart={onRestart}
              />
            </BookSurface>
          ))}
          {turnOverlay ? (
            <div
              className={`page-turn-overlay ${turnOverlay.direction}`}
              aria-hidden="true"
              inert
              onAnimationEnd={(event) => {
                if (event.animationName.startsWith('turn-page')) clearOverlay();
              }}
            >
              {turnOverlay.indices.map((index, position) => {
                const isTurningLeaf =
                  singlePage ||
                  (turnOverlay.direction === 'forward'
                    ? position === 1
                    : position === 0);
                return (
                  <BookSurface
                    key={`overlay-${leaves[index].key}-${index}`}
                    side={
                      singlePage ? 'single' : position === 0 ? 'left' : 'right'
                    }
                  >
                    {/* The turning sheet is real paper: the outgoing page on
                        the front, the destination page on the back, so it
                        lands seamlessly on the spread beneath. */}
                    <div className="overlay-face front">
                      <BookLeafPage
                        leaf={leaves[index]}
                        session={session}
                        recoveryReady={false}
                        streamingEntryId={null}
                        motionCues={EMPTY_MOTION_CUES}
                        isLatest={index === latestLeaf}
                        onReadBeginning={() => {}}
                        onStreamed={() => {}}
                        onRestart={onRestart}
                      />
                    </div>
                    <div className="overlay-face back">
                      {isTurningLeaf ? (
                        <BookLeafPage
                          leaf={leaves[turnOverlay.backIndex]}
                          session={session}
                          recoveryReady={false}
                          streamingEntryId={null}
                          motionCues={EMPTY_MOTION_CUES}
                          isLatest={turnOverlay.backIndex === latestLeaf}
                          onReadBeginning={() => {}}
                          onStreamed={() => {}}
                          onRestart={onRestart}
                        />
                      ) : null}
                    </div>
                  </BookSurface>
                );
              })}
            </div>
          ) : null}
        </div>
      </section>
      {/* oxlint-enable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */}
      <nav className="book-navigation" aria-label="Manuscript page navigation">
        <button
          type="button"
          disabled={unit <= 0}
          onClick={() => move(-1)}
          aria-label={singlePage ? 'Previous page' : 'Previous pages'}
        >
          ←
        </button>
        <span>
          {singlePage
            ? leafNavigationLabel(leaves[activeLeaf])
            : spreadNavigationLabel(leaves, visibleIndices)}
        </span>
        <button
          type="button"
          disabled={unit >= maxUnit}
          onClick={() => move(1)}
          aria-label={singlePage ? 'Next page' : 'Next pages'}
        >
          →
        </button>
      </nav>
    </section>
  );
}

function BookSurface({
  side,
  children,
}: {
  side: 'left' | 'right' | 'single';
  children: React.ReactNode;
}) {
  return <article className={`book-leaf ${side}`}>{children}</article>;
}

function BookLeafPage({
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
  if (leaf.kind === 'bookplate')
    return (
      <div className="bookplate-copy">
        <span className="bookplate-mark">M</span>
        <p>This manuscript belongs to</p>
        <h2>
          {session.character.name === 'the traveler'
            ? 'The traveler'
            : session.character.name}
        </h2>
        <dl>
          <div>
            <dt>Strength</dt>
            <dd>{titleCase(session.character.specialty)}</dd>
          </div>
          <div>
            <dt>Rule</dt>
            <dd>Six pages before midnight</dd>
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
            <p>Tell ChatGPT what you do next.</p>
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

function MarginNotes({ events }: { events: CanonicalEvent[] }) {
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

const LedgerDialog = function LedgerDialog({
  ref,
  session,
  unseen,
  onSeen,
  onRestart,
}: {
  ref: React.Ref<HTMLDialogElement>;
  session: ExperienceSession;
  unseen: UnseenLedger;
  onSeen: () => void;
  onRestart: () => Promise<void>;
}) {
  const { story } = useExperience();
  const maxClock = story.limits.maxClock;
  const newInventoryLabels = unseen.inventoryIds.map((id) =>
    story.itemLabel(id),
  );
  const newClueLabels = unseen.clueIds.map((id) => story.clueLabel(id));
  return (
    // Clicking the backdrop targets the dialog element itself; Escape and the
    // close button remain the keyboard equivalents.
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <dialog
      className="ledger-dialog"
      ref={ref}
      aria-labelledby="ledger-title"
      onClose={onSeen}
      onClick={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
    >
      <header>
        <div>
          <p className="eyebrow">Written as it happens</p>
          <h2 id="ledger-title">Adventure ledger</h2>
        </div>
        <form method="dialog">
          <button type="submit" aria-label="Close ledger">
            ×
          </button>
        </form>
      </header>
      <div className="ledger-dialog-content">
        <section className="ledger-section clock-section">
          <div className="section-heading">
            <h2>Midnight clock</h2>
            <span>
              {session.clock} of {maxClock}
            </span>
          </div>
          <div className="clock-track" aria-hidden="true">
            {Array.from({ length: maxClock }, (_, index) => (
              <span
                className={[
                  index < session.clock ? 'filled' : '',
                  unseen.clock === session.clock && index === session.clock - 1
                    ? 'is-new'
                    : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                key={index}
              />
            ))}
          </div>
          <p>
            {session.clock < maxClock
              ? `${maxClock - session.clock} ${maxClock - session.clock === 1 ? 'page remains' : 'pages remain'} before midnight.`
              : 'The sixth bell has sounded.'}
          </p>
        </section>
        <LedgerList
          title="Inventory"
          empty="Your hands are empty."
          items={session.inventoryIds.map((id) => story.itemLabel(id))}
          emphasizedItems={newInventoryLabels}
        />
        <LedgerList
          title="Clues"
          empty="No certain clues yet."
          items={session.clueIds.map((id) => story.clueLabel(id))}
          emphasizedItems={newClueLabels}
        />
        <section className="ledger-section">
          <h2>Attributes</h2>
          <dl className="attribute-list">
            {story.attributes.map((attribute) => (
              <div key={attribute.id}>
                <dt>
                  {attribute.label}
                  {session.character.specialty === attribute.id ? (
                    <small>Strength</small>
                  ) : null}
                </dt>
                <dd>+{session.stats[attribute.id]}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section className="ledger-section">
          <h2>The book&apos;s spells</h2>
          {session.unlockedAbilityIds.length ? (
            <ul className="spell-list">
              {session.unlockedAbilityIds.map((id) => (
                <li
                  className={unseen.abilityIds.includes(id) ? 'is-new' : ''}
                  key={id}
                >
                  <span aria-hidden="true">✦</span>
                  <div>
                    <strong>{story.abilityLabel(id)}</strong>
                    <p>{story.abilityDescription(id)}</p>
                    <small>
                      {session.usedAbilityIds.includes(id)
                        ? 'Used'
                        : 'Ready for ChatGPT'}
                    </small>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-copy">
              Artifacts you recover teach the book new spells.
            </p>
          )}
        </section>
        {!session.pendingResolution && session.phase !== 'COMPLETE' ? (
          <section className="ledger-section next-actions">
            <h2>What the book will resolve</h2>
            <ul>
              {story.getAffordances(session).map((affordance) => (
                <li key={affordance.id}>
                  <div>
                    <strong>{affordance.label}</strong>
                    <p>{affordance.description}</p>
                  </div>
                  <CopyButton
                    className="affordance-copy"
                    text={affordanceMessage(affordance)}
                    idleLabel="Copy"
                  />
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {session.phase !== 'COMPLETE' ? (
          <section className="ledger-section ledger-restart">
            <h2>Start over</h2>
            <RestartButton
              idleLabel="Start a new manuscript"
              onRestart={onRestart}
            />
          </section>
        ) : null}
      </div>
    </dialog>
  );
};

function useSinglePage(): boolean {
  const [singlePage, setSinglePage] = useState(
    () => window.matchMedia('(max-width: 900px)').matches,
  );
  useEffect(() => {
    const query = window.matchMedia('(max-width: 900px)');
    const update = () => setSinglePage(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return singlePage;
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    Boolean(
      target.closest(
        'button, a, input, textarea, select, summary, details, dialog',
      ),
    )
  );
}

function leafNavigationLabel(leaf: BookLeaf): string {
  if (leaf.kind === 'bookplate') return 'Bookplate';
  if (leaf.kind === 'prologue') return 'Prologue';
  return `${leaf.kind === 'draft' ? 'Draft ' : ''}Page ${formatPageNumber(leaf.turn!)}`;
}

function spreadNavigationLabel(
  leaves: BookLeaf[],
  visibleIndices: number[],
): string {
  const visibleLeaves = visibleIndices.map((index) => leaves[index]);
  if (visibleLeaves[0]?.kind === 'bookplate') return 'Bookplate · Prologue';
  const turns = visibleLeaves
    .map((leaf) => leaf.turn)
    .filter((turn): turn is number => turn !== null && turn > 0);
  if (!turns.length) return 'Manuscript pages';
  if (turns.length === 1) return `Page ${formatPageNumber(turns[0])}`;
  return `Pages ${formatPageNumber(turns[0])}–${formatPageNumber(turns.at(-1)!)}`;
}

function eventTypeLabel(type: CanonicalEvent['type']): string {
  return {
    location: 'Location',
    item: 'Item',
    clue: 'Clue',
    ability: 'Ability',
    resolve: 'Resolve',
    story: 'Story',
    ending: 'Ending',
  }[type];
}

function ConnectionIssueNotice({
  status,
  onRetry,
  compact = false,
}: {
  status: WebMCPStatus;
  onRetry: () => void;
  compact?: boolean;
}) {
  if (status === 'connected') return null;
  if (status === 'connecting')
    return (
      <output className="connection-pending">Checking browser support…</output>
    );
  if (status === 'disabled')
    return <WebMCPDisabledNotice onRetry={onRetry} compact={compact} />;
  if (status === 'unsupported')
    return (
      <div className="capability-notice" role="alert">
        <strong>WebMCP isn&apos;t available in this browser.</strong>
      </div>
    );
  return <ConnectionErrorNotice onRetry={onRetry} />;
}

function WebMCPDisabledNotice({
  onRetry,
  compact,
}: {
  onRetry: () => void;
  compact: boolean;
}) {
  return (
    <div
      className={`capability-notice${compact ? ' is-compact' : ''}`}
      role="alert"
    >
      <strong>Turn on WebMCP</strong>
      <p>
        <b>ChatGPT</b>
        <span>Browser settings → Permissions → Enable site tools</span>
      </p>
      <ChromeFlagRow />
      <button className="support-action" type="button" onClick={onRetry}>
        Check again
      </button>
    </div>
  );
}

function ConnectionErrorNotice({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="connection-error-notice" role="alert">
      <p>WebMCP couldn&apos;t start.</p>
      <button type="button" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}
function RestartButton({
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
        rolls; ChatGPT writes the page.
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
          ChatGPT is adding this turn to the manuscript…
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
            Your roll is safe. If ChatGPT stopped, copy this message and send it
            in the same chat.
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

function StreamingProse({
  prose,
  animate,
  onStreamed,
}: {
  prose: string;
  animate: boolean;
  onStreamed?: () => void;
}) {
  const [visibleLength, setVisibleLength] = useState(() => {
    const reduceMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    return animate && !reduceMotion ? 0 : prose.length;
  });
  const notifiedDone = useRef(false);
  const notifyDone = () => {
    if (notifiedDone.current) return;
    notifiedDone.current = true;
    onStreamed?.();
  };

  useEffect(() => {
    if (!animate) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      notifyDone();
      return;
    }
    const startedAt = performance.now();
    const duration = Math.min(2200, Math.max(1200, prose.length * 7));
    let frame = 0;
    const reveal = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      setVisibleLength((current) =>
        Math.max(
          current,
          wordBoundary(prose, Math.ceil(prose.length * progress)),
        ),
      );
      if (progress < 1) frame = window.requestAnimationFrame(reveal);
      else notifyDone();
    };
    frame = window.requestAnimationFrame(reveal);
    // Leaving the page mid-reveal counts as done, so it never replays.
    return () => {
      window.cancelAnimationFrame(frame);
      notifyDone();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animate, prose]);

  const isStreaming = visibleLength < prose.length;
  return (
    // Tap-to-skip is a shortcut only: the reveal self-completes within ~2s
    // and the full text is always present for assistive tech.
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <p
      className="manuscript-prose"
      data-testid="streaming-prose"
      data-streaming={isStreaming ? 'true' : 'false'}
      onPointerDown={() => {
        if (!isStreaming) return;
        setVisibleLength(prose.length);
        notifyDone();
      }}
    >
      <span className="sr-only">{prose}</span>
      <span aria-hidden="true">
        {prose.slice(0, visibleLength)}
        {isStreaming ? <span className="stream-caret" /> : null}
      </span>
    </p>
  );
}

function wordBoundary(prose: string, index: number): number {
  if (index <= 0) return 0;
  if (index >= prose.length) return prose.length;
  const nextSpace = prose.indexOf(' ', index);
  return nextSpace === -1 ? prose.length : nextSpace;
}

function RollCard({
  resolution,
  settle = false,
}: {
  resolution: TurnResolution;
  settle?: boolean;
}) {
  const roll = resolution.roll;
  const [shownDie, setShownDie] = useState(() =>
    settle && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? null
      : roll.die,
  );

  useEffect(() => {
    if (
      !settle ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    )
      return;
    const startedAt = performance.now();
    let lastSwap = 0;
    let frame = 0;
    const spin = (now: number) => {
      if (now - startedAt >= 420) {
        setShownDie(roll.die);
        return;
      }
      if (now - lastSwap >= 55) {
        lastSwap = now;
        setShownDie(1 + Math.floor(Math.random() * 20));
      }
      frame = window.requestAnimationFrame(spin);
    };
    frame = window.requestAnimationFrame(spin);
    return () => {
      window.cancelAnimationFrame(frame);
      setShownDie(roll.die);
    };
  }, [settle, roll.die]);

  return (
    <div
      className={`roll-card${settle ? ' is-settling' : ''}`}
      data-settling={settle ? 'true' : 'false'}
      data-tier={roll.tier}
      aria-label={`D20 result: ${roll.die} plus ${titleCase(roll.attribute)} ${roll.modifier} equals ${roll.total} against ${roll.dc}. ${tierLabel(roll.tier)}.`}
    >
      <span className="die">{shownDie ?? roll.die}</span>
      <div>
        <strong>
          {roll.die} + {titleCase(roll.attribute)} {roll.modifier} ={' '}
          {roll.total}
        </strong>
        <span>
          vs {roll.dc} — {tierLabel(roll.tier)}
        </span>
      </div>
    </div>
  );
}
function AbilityCard({
  abilityId,
  celebrate = false,
}: {
  abilityId: string;
  celebrate?: boolean;
}) {
  const { story } = useExperience();
  return (
    <div
      className={`ability-card${celebrate ? ' is-unlocking' : ''}`}
      data-new={celebrate ? 'true' : 'false'}
    >
      <span className="ability-sigil" aria-hidden="true">
        ✦
      </span>
      <div>
        <small>The book learns a spell</small>
        <strong>{story.abilityLabel(abilityId)}</strong>
        <p>{story.abilityDescription(abilityId)}</p>
      </div>
    </div>
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
function LedgerList({
  title,
  items,
  empty,
  emphasizedItems = [],
}: {
  title: string;
  items: string[];
  empty: string;
  emphasizedItems?: string[];
}) {
  return (
    <section className="ledger-section">
      <h2>{title}</h2>
      {items.length ? (
        <ul className="token-list">
          {items.map((item) => (
            <li
              className={emphasizedItems.includes(item) ? 'is-new' : ''}
              key={item}
            >
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty-copy">{empty}</p>
      )}
    </section>
  );
}

function ChromeFlagRow() {
  const flagRef = useRef<HTMLInputElement>(null);
  return (
    <div className="chrome-flag-row">
      <span>Chrome</span>
      <input
        aria-label="Chrome WebMCP flag URL"
        readOnly
        ref={flagRef}
        value={CHROME_WEBMCP_FLAG}
        onFocus={(event) => event.currentTarget.select()}
      />
      <FlagCopyButton
        text={CHROME_WEBMCP_FLAG}
        onCopyFailure={() => {
          flagRef.current?.focus();
          flagRef.current?.select();
        }}
      />
    </div>
  );
}

type CopyFeedback = 'copied' | 'failed' | null;

function FlagCopyButton({
  text,
  onCopyFailure,
}: {
  text: string;
  onCopyFailure: () => void;
}) {
  const [feedback, setFeedback] = useState<CopyFeedback>(null);
  const [copying, setCopying] = useState(false);
  const timer = useRef<number | null>(null);
  const tooltipId = useId();

  const showFeedback = (next: Exclude<CopyFeedback, null>): void => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    setFeedback(next);
    timer.current = window.setTimeout(() => {
      setFeedback(null);
      timer.current = null;
    }, 5_000);
  };

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const copied = feedback === 'copied';
  return (
    <span className="flag-copy-control">
      <CopyTooltip
        id={tooltipId}
        message={
          feedback === 'copied'
            ? 'Copied'
            : feedback === 'failed'
              ? 'Copy failed'
              : null
        }
      />
      <button
        aria-describedby={feedback ? tooltipId : undefined}
        aria-label={copied ? 'Chrome flag URL copied' : 'Copy Chrome flag URL'}
        className="flag-copy-button"
        disabled={copying || copied}
        type="button"
        onClick={() => {
          setCopying(true);
          setFeedback(null);
          void copyText(text)
            .then(() => showFeedback('copied'))
            .catch(() => {
              showFeedback('failed');
              onCopyFailure();
            })
            .finally(() => setCopying(false));
        }}
      >
        {copied ? (
          <span className="flag-copy-check" aria-hidden="true">
            ✓
          </span>
        ) : (
          <span className="flag-copy-icon" aria-hidden="true" />
        )}
      </button>
    </span>
  );
}

function CopyTooltip({ id, message }: { id: string; message: string | null }) {
  if (!message) return null;
  return (
    <output aria-live="polite" className="copy-tooltip" id={id}>
      {message}
    </output>
  );
}

function CopyButton({
  text,
  idleLabel,
  className = '',
}: {
  text: string;
  idleLabel: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [showFallback, setShowFallback] = useState(false);
  return (
    <>
      <button
        className={`copy-button${copied ? ' is-copied' : ''}${className ? ` ${className}` : ''}`}
        type="button"
        onClick={() =>
          void copyText(text)
            .then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1800);
            })
            .catch(() => setShowFallback(true))
        }
      >
        {copied ? (
          <>
            <span aria-hidden="true">✓</span> Copied
          </>
        ) : (
          idleLabel
        )}
      </button>
      {showFallback ? (
        <label className="copy-fallback">
          <span>Copy this message</span>
          <textarea
            readOnly
            value={text}
            onFocus={(event) => event.currentTarget.select()}
          />
        </label>
      ) : null}
    </>
  );
}

async function copyText(text: string): Promise<void> {
  if (!navigator.clipboard?.writeText)
    throw new Error('Clipboard access is unavailable in this browser.');
  return navigator.clipboard.writeText(text);
}

function affordanceMessage(affordance: Affordance): string {
  const label = affordance.label;
  return `I ${label.charAt(0).toLowerCase()}${label.slice(1)}.`;
}

function sampleResolution(): TurnResolution {
  return {
    resolutionId: 'sample',
    actionId: 'search_hearth',
    intent: 'Search the hearth',
    turn: 1,
    createdAt: 0,
    roll: {
      die: 14,
      attribute: 'wits',
      modifier: 2,
      total: 16,
      dc: 13,
      tier: 'success',
    },
    canonicalEvents: [],
    representedEventIds: [],
    mustInclude: [],
    mustNotClaim: [],
    newAbilityIds: [],
  };
}
function tierLabel(tier: TurnResolution['roll']['tier']): string {
  return {
    critical_success: 'Critical success',
    success: 'Success',
    costly_success: 'Success at a cost',
    setback: 'Setback',
    critical_setback: 'Critical setback',
  }[tier];
}
function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
function statusAnnouncement(
  session: ExperienceSession,
  story: StoryDefinition,
): string {
  if (session.pendingResolution)
    return `Roll saved: ${session.pendingResolution.roll.total} against ${session.pendingResolution.roll.dc}. ChatGPT is writing the manuscript.`;
  if (session.phase === 'COMPLETE')
    return `The manuscript is complete: ${session.endingId ? story.endingLabel(session.endingId) : 'ending saved'}.`;
  const remaining = story.limits.maxClock - session.clock;
  return `Page ${session.turn} is saved. ${remaining === 1 ? 'One page remains' : `${remaining} pages remain`} before midnight. It is your turn.`;
}
