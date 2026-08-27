'use client';

import { QRCodeSVG } from 'qrcode.react';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore } from 'react';
import { Tooltip } from './tooltip';
import { gameGateway } from '@/lib/game/gateway';
import {
  STICKERS,
  STICKER_META,
  type GameMode,
  type PlayerSelfSnapshot,
  type PublicGameSnapshot,
  type PublicPlayer,
  type RoomBootstrap,
  type Seat,
  type Sticker,
} from '@/lib/game/contracts';
import { initialRoomState, roomReducer } from '@/lib/game/reducer';
import { displaySeconds, measureServerClock, monotonicNowMs, remainingMs, type ServerClock } from '@/lib/game/timing';
import { bindHostRoom, getWebMcpCapability } from '@/lib/webmcp/registry';
import { hasSupabaseConfig } from '@/lib/supabase/client';

function roomFromLocation(): string | null {
  if (typeof window === 'undefined') return null;
  const value = new URLSearchParams(window.location.search).get('room')?.trim().toUpperCase();
  return value && /^[A-Z0-9]{4}$/.test(value) ? value : null;
}

function friendlyError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/room full/i.test(message)) return 'This room already has two players.';
  if (/not found|invalid room/i.test(message)) return 'That room code does not exist or has expired.';
  if (/sticker/i.test(message)) return 'That sticker is already taken. Pick another one.';
  return message;
}

export function GameApp() {
  const [roomCode, setRoomCode] = useState<string | null>(() => roomFromLocation());
  const [state, dispatch] = useReducer(roomReducer, initialRoomState);
  const timerSeconds = 8 as const;
  const refreshInFlight = useRef<Promise<void> | null>(null);
  const activeGameId = state.bootstrap?.publicState.gameId;
  const activePhase = state.bootstrap?.publicState.phase;
  const activeViewer = state.bootstrap?.viewerKind;

  const refresh = useCallback(async () => {
    const bootstrap = state.bootstrap;
    if (!bootstrap || bootstrap.viewerKind === 'join') return;
    if (refreshInFlight.current) return refreshInFlight.current;
    const task = (async () => {
      const next = await gameGateway.refresh(bootstrap.publicState.gameId, bootstrap.viewerKind);
      dispatch({ type: 'snapshot', payload: next });
    })().finally(() => { refreshInFlight.current = null; });
    refreshInFlight.current = task;
    return task;
  }, [state.bootstrap]);

  const run = useCallback(async (label: string, action: () => Promise<RoomBootstrap>) => {
    dispatch({ type: 'pending', payload: label });
    try {
      dispatch({ type: 'bootstrapped', payload: await action() });
    } catch (error) {
      dispatch({ type: 'error', payload: friendlyError(error) });
    } finally {
      dispatch({ type: 'pending', payload: null });
    }
  }, []);

  useEffect(() => {
    if (!roomCode || state.bootstrap) return;
    void run('Joining room…', () => gameGateway.bootstrapRoom(roomCode));
  }, [roomCode, run, state.bootstrap]);

  useEffect(() => {
    if (!activeGameId || !activeViewer || activeViewer === 'join') return;
    let disposed = false;
    let unsubscribe = () => {};
    void gameGateway.subscribe(
      activeGameId,
      () => { if (!disposed) void refresh(); },
      (status) => {
        if (!disposed) dispatch({ type: 'connection', payload: { status: status === 'SUBSCRIBED' ? 'connected' : 'reconnecting' } });
      },
    ).then((cleanup) => {
      if (disposed) cleanup();
      else unsubscribe = cleanup;
    });
    const interval = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, activePhase === 'lobby' ? 10_000 : 5_000);
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { disposed = true; window.clearInterval(interval); document.removeEventListener('visibilitychange', onVisible); unsubscribe(); };
  }, [activeGameId, activePhase, activeViewer, refresh]);

  useEffect(() => {
    if (state.bootstrap?.viewerKind !== 'host') return;
    let release = () => {};
    void bindHostRoom(state.bootstrap.publicState.gameId, refresh)
      .then((nextRelease) => { release = nextRelease; })
      .catch((error) => dispatch({ type: 'error', payload: friendlyError(error) }));
    return () => release();
  }, [refresh, state.bootstrap?.publicState.gameId, state.bootstrap?.viewerKind]);

  const navigateToRoom = useCallback((bootstrap: RoomBootstrap) => {
    const nextRoom = bootstrap.publicState.roomCode;
    window.history.replaceState({}, '', `/?room=${nextRoom}`);
    setRoomCode(nextRoom);
    dispatch({ type: 'bootstrapped', payload: bootstrap });
  }, []);

  const createRoom = async (mode: GameMode) => {
    dispatch({ type: 'error', payload: null });
    if (!hasSupabaseConfig()) {
      dispatch({ type: 'error', payload: 'This build needs its Supabase public environment values before rooms can be created.' });
      return;
    }
    const capability = getWebMcpCapability();
    if (!capability.supported) {
      dispatch({ type: 'error', payload: capability.reason ?? 'WebMCP is unavailable.' });
      return;
    }
    dispatch({ type: 'pending', payload: 'Creating room…' });
    try { navigateToRoom(await gameGateway.createRoom(mode, timerSeconds)); }
    catch (error) { dispatch({ type: 'error', payload: friendlyError(error) }); }
    finally { dispatch({ type: 'pending', payload: null }); }
  };

  if (!roomCode) return <Landing onCreate={createRoom} pending={state.pendingAction} error={state.error} />;
  if (!state.bootstrap) return <LoadingScreen roomCode={roomCode} message={state.pendingAction ?? 'Finding your room…'} error={state.error} />;
  if (state.bootstrap.viewerKind === 'join') return <JoinRoom bootstrap={state.bootstrap} pending={state.pendingAction} error={state.error} onJoin={(sticker) => run('Claiming your seat…', () => gameGateway.claimSeat(roomCode, sticker))} />;
  return <RoomExperience bootstrap={state.bootstrap} connection={state.connection.status} pending={state.pendingAction} error={state.error} onAction={run} />;
}

function BrandHeader({ roomCode }: { roomCode?: string }) {
  return (
    <header className="site-header">
      {/* Vinext's production RSC prefetch currently throws for this same-document reset link. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a className="brand" href="/" aria-label="Can You Be Me? home"><span className="brand-mark" aria-hidden="true">?</span><span>Can You Be Me?</span></a>
      {roomCode ? <span className="room-pill">Room <strong>{roomCode}</strong></span> : null}
    </header>
  );
}

function subscribeToBrowserFocus(onChange: () => void) {
  window.addEventListener('focus', onChange);
  return () => window.removeEventListener('focus', onChange);
}

function readWebMcpSupport(): true | string {
  const capability = getWebMcpCapability();
  // A primitive snapshot stays stable between reads of the browser capability.
  return capability.supported ? true : capability.reason ?? 'WebMCP is unavailable in this browser.';
}

function Landing({ onCreate, pending, error }: { onCreate(mode: GameMode): void; pending: string | null; error: string | null }) {
  // The server and first hydration render must wait for a browser-side check.
  const support = useSyncExternalStore(subscribeToBrowserFocus, readWebMcpSupport, () => null);
  const browserUnsupported = support === 'WebMCP is unavailable in this browser.';
  const supportMessage = typeof support !== 'string' ? null
    : browserUnsupported ? <>This browser doesn’t support <a href="https://developer.chrome.com/docs/ai/webmcp" target="_blank" rel="noopener noreferrer" title="Official documentation (opens in a new tab)">WebMCP</a></>
    : support;

  return <main id="content" className="game-shell landing-shell" tabIndex={-1}><BrandHeader /><div className="landing-stage"><section className="hero" aria-labelledby="game-title"><p className="eyebrow">2 players · 2 phones · 5–7 min</p><h1 id="game-title">Can you fool the AI Detective?</h1><p className="lede">Two friends team up against an AI Detective. First, it learns your real answers. Then one becomes the Mirror and tries to copy the other.</p><div className="hero-actions"><Tooltip content={supportMessage} interactiveLabel={browserUnsupported ? 'Browser support' : undefined}><button className="button button-primary" type="button" onClick={() => onCreate('standard')} disabled={support !== true || Boolean(pending)}>{pending ?? 'Start a game'}</button></Tooltip></div>{error && <p className="error-banner" role="alert">{error}</p>}</section><HowItWorks /></div><footer><p>Built for the WebMCP Challenge</p></footer></main>;
}

const TUTORIAL_STEPS = [
  {
    icon: '👋',
    navLabel: 'Learn',
    title: 'Start with honest answers',
    body: 'Join on two phones. Before roles exist, both of you answer five questions honestly so the AI Detective can learn your differences.',
  },
  {
    icon: '🎭',
    navLabel: 'Roles',
    title: 'Get secret roles',
    body: 'One phone gets Original; the other gets Mirror. You’re on the same team, and the roles stay hidden from the AI Detective.',
  },
  {
    icon: '🪞',
    navLabel: 'Play',
    title: 'Answer for your role',
    body: 'Across four Challenges, Original answers as themselves. Mirror predicts the Original. The AI Detective reveals both answers and marks a suspect.',
  },
  {
    icon: '✋',
    navLabel: 'Object',
    title: 'Object once, before you know',
    body: 'After Challenge 3, you have 3 seconds to blindly use one shared Objection before seeing the suspicion. First tap spends it; the hidden suspect answers one extra question.',
  },
  {
    icon: '🏆',
    navLabel: 'Win',
    title: 'Make the AI accuse the wrong player',
    body: 'The AI Detective accuses one player of being the Mirror. If it points at the Original, you both win. If it catches the Mirror, the AI wins.',
  },
] as const;

function HowItWorks() {
  const [activeStep, setActiveStep] = useState(0);
  const [showTabFocus, setShowTabFocus] = useState(false);
  const stepButtons = useRef<Array<HTMLButtonElement | null>>([]);
  const step = TUTORIAL_STEPS[activeStep];

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Tab') { setShowTabFocus(true); return; }
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.isComposing) return;
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.isContentEditable || target?.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""], [contenteditable="plaintext-only"], [role="textbox"], [role="slider"], [role="spinbutton"], [role="combobox"], [role="dialog"], dialog')) return;
      event.preventDefault();
      const next = (activeStep + (event.key === 'ArrowRight' ? 1 : -1) + TUTORIAL_STEPS.length) % TUTORIAL_STEPS.length;
      setActiveStep(next);
      setShowTabFocus(false);
      // Page-wide shortcuts do not steal focus or scroll the tutorial into view.
      if (stepButtons.current.includes(document.activeElement as HTMLButtonElement)) {
        stepButtons.current[next]?.focus({ preventScroll: true });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeStep]);

  return <section className="tutorial" aria-labelledby="tutorial-title"><div className="tutorial-topline"><p className="eyebrow">How to play</p><span className="tutorial-step-count">Step {activeStep + 1} of {TUTORIAL_STEPS.length}</span></div><TutorialScene step={activeStep} /><div className="tutorial-copy" aria-live="polite" aria-atomic="true"><h2 id="tutorial-title"><span className="step-icon" aria-hidden="true">{step.icon}</span><span className="tutorial-title-text">{step.title}</span></h2><p>{step.body}</p></div><ol className="tutorial-steps" aria-label="Game rules" role="list" data-tab-focus={showTabFocus || undefined}>{TUTORIAL_STEPS.map((item, index) => <li key={item.title}><button
    ref={(button) => { stepButtons.current[index] = button; }}
    type="button"
    tabIndex={index === activeStep ? 0 : -1}
    aria-current={index === activeStep ? 'step' : undefined}
    aria-label={`Show step ${index + 1}: ${item.title}`}
    onClick={() => { setActiveStep(index); setShowTabFocus(false); }}
    onKeyDown={(event) => {
      let next: number;
      if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = TUTORIAL_STEPS.length - 1;
      else return;
      event.preventDefault();
      setActiveStep(next);
      setShowTabFocus(false);
      stepButtons.current[next]?.focus();
    }}><span className="step-index">{index + 1}</span><strong>{item.navLabel}</strong></button></li>)}</ol></section>;
}

function TutorialQuestion({ phase, question, className }: { phase: string; question: string; className: string }) {
  return <div className={`tutorial-question ${className}`}><span className="tutorial-round-badge">{phase}</span><strong>{question}</strong></div>;
}

function TutorialPersonCard({ label, emoji, answer, className }: { label?: string; emoji: string; answer: string; className: string }) {
  return <div className={`tutorial-card tutorial-person-card ${className}`}>{label && <small>{label}</small>}<span>{emoji}</span><strong>{answer}</strong></div>;
}

function TutorialScene({ step }: { step: number }) {
  return <div className={`tutorial-scene tutorial-scene-${step + 1}`} key={step} aria-hidden="true">
    {step !== 3 && <div className="tutorial-scene-header">
      {step === 0 && <TutorialQuestion className="learn-label" phase="Learn" question="What would you order?" />}
      {step === 1 && <div className="tutorial-round-badge secret-stamp">Secret roles</div>}
      {step === 2 && <TutorialQuestion className="demo-question" phase="Challenge" question="Favorite snack?" />}
      {step === 4 && <div className="verdict-title"><span>🕵️</span><strong>Final accusation</strong></div>}
    </div>}
    <div className={`tutorial-scene-body${step === 2 ? ' tutorial-play-scene' : ''}`}>
      <div className="tutorial-scene-cards">
      {step === 0 && <><TutorialPersonCard className="learn-phone learn-phone-a" emoji="🐯" answer="Pizza" /><TutorialPersonCard className="learn-phone learn-phone-b" emoji="👻" answer="Sushi" /></>}
      {step === 1 && <><TutorialPersonCard className="role-card original" label="Answer as yourself" emoji="🐯" answer="Original" /><TutorialPersonCard className="role-card mirror" label="Answer like the Original" emoji="👻" answer="Mirror" /></>}
      {step === 2 && <><TutorialPersonCard className="answer-card answer-a" label="Original · Myself" emoji="🐯" answer="Pizza" /><TutorialPersonCard className="answer-card answer-b" label="Mirror · My prediction" emoji="👻" answer="Pizza" /></>}
      {step === 3 && <><div className="tutorial-card objection-token"><span className="tutorial-corner-emoji" aria-hidden="true">✋</span><strong>Objection!</strong></div><div className="tutorial-card follow-up-card"><span className="tutorial-corner-emoji" aria-hidden="true">🤖</span><small>Extra question</small><strong>Keep or switch?</strong></div></>}
      {step === 4 && <><div className="tutorial-card outcome-card humans"><small>Accuses Original</small><strong>You both win!</strong></div><div className="tutorial-card outcome-card detective"><small>Catches Mirror</small><strong>AI wins</strong></div></>}
      </div>
      {step === 2 && <div className="suspicion-badge"><span>🕵️</span><strong>Who copied?</strong></div>}
    </div>
  </div>;
}

function LoadingScreen({ roomCode, message, error }: { roomCode: string; message: string; error: string | null }) {
  return <main className="game-shell"><BrandHeader roomCode={roomCode} /><section className="solo-panel" role="status"><div className="detective-icon">🕵️</div><h1>{message}</h1>{error && <p className="error-banner" role="alert">{error}</p>}</section></main>;
}

function JoinRoom({ bootstrap, pending, error, onJoin }: { bootstrap: RoomBootstrap; pending: string | null; error: string | null; onJoin(sticker: Sticker): void }) {
  const used = new Set(bootstrap.publicState.players.map((player) => player.sticker).filter(Boolean));
  return <main className="game-shell phone-shell"><BrandHeader roomCode={bootstrap.publicState.roomCode} /><section className="phone-panel"><h1>Choose your sticker</h1><p>Each player needs a different one.</p><div className="sticker-picker">{STICKERS.map((sticker) => { const meta = STICKER_META[sticker]; const disabled = used.has(sticker); return <button key={sticker} type="button" disabled={disabled || Boolean(pending)} onClick={() => onJoin(sticker)}><span aria-hidden="true">{meta.emoji}</span><strong>{meta.label}</strong>{disabled && <small>Taken</small>}</button>; })}</div>{pending && <p role="status">{pending}</p>}{error && <p className="error-banner" role="alert">{error}</p>}</section></main>;
}

function RoomExperience({ bootstrap, connection, pending, error, onAction }: { bootstrap: RoomBootstrap; connection: string; pending: string | null; error: string | null; onAction(label: string, action: () => Promise<RoomBootstrap>): Promise<void> }) {
  const { publicState, selfState, viewerKind } = bootstrap;
  const action = (label: string, fn: () => Promise<RoomBootstrap>) => () => void onAction(label, fn);
  return <main className={`game-shell ${viewerKind === 'host' ? 'host-shell' : 'phone-shell'}`}><BrandHeader roomCode={publicState.roomCode} />{connection !== 'connected' && <div className="connection-banner" role="status">Reconnecting… Your seat is safe.</div>}{viewerKind === 'host' ? <HostBoard game={publicState} pending={pending} onAction={action} /> : <PlayerView game={publicState} self={selfState!} pending={pending} onAction={action} />}{error && <p className="error-banner floating-error" role="alert">{error}</p>}</main>;
}

function HostBoard({ game, pending, onAction }: { game: PublicGameSnapshot; pending: string | null; onAction(label: string, action: () => Promise<RoomBootstrap>): () => void }) {
  const joinUrl = typeof window === 'undefined' ? '' : `${window.location.origin}/?room=${game.roomCode}`;
  return <section className="host-board" aria-labelledby="board-title"><div className="board-topline"><div><p className="eyebrow">Main screen · {game.mode === 'demo' ? 'Demo Room' : 'Live Room'}</p><h1 id="board-title">{phaseTitle(game)}</h1></div><Progress phase={game.phase} round={game.round} /></div>{game.phase === 'lobby' ? <LobbyBoard game={game} joinUrl={joinUrl} pending={pending} onAction={onAction} /> : <ActiveBoard game={game} />}</section>;
}

function LobbyBoard({ game, joinUrl, pending, onAction }: { game: PublicGameSnapshot; joinUrl: string; pending: string | null; onAction(label: string, action: () => Promise<RoomBootstrap>): () => void }) {
  return <div className="lobby-layout"><div className="join-card"><div className="qr-wrap">{joinUrl && <QRCodeSVG value={joinUrl} size={180} level="M" />}</div><p>Scan with both phones</p><strong className="big-code">{game.roomCode}</strong><button type="button" className="text-button" onClick={() => void navigator.clipboard.writeText(joinUrl)}>Copy join link</button></div><div className="lobby-players">{game.players.map((player) => <PlayerSummary key={player.seat} player={player} />)}<label className="toggle-row"><input type="checkbox" checked={game.timerSeconds === 15} disabled={game.players.some((player) => player.ready) || Boolean(pending)} onChange={(event) => void onAction('Updating timer…', () => gameGateway.setTimerMode(game.gameId, event.target.checked ? 15 : 8))()} /><span><strong>Extended answer time</strong><small>{game.timerSeconds === 15 ? '15 seconds' : '8 seconds'}</small></span></label></div></div>;
}

function ActiveBoard({ game }: { game: PublicGameSnapshot }) {
  return <div className="active-board"><PlayerSummary player={game.players[0]} suspicion={game.suspicion?.targetSeat === 'seat_a'} /><CenterStage game={game} /><PlayerSummary player={game.players[1]} suspicion={game.suspicion?.targetSeat === 'seat_b'} /></div>;
}

function PlayerSummary({ player, suspicion = false }: { player: PublicPlayer; suspicion?: boolean }) {
  const meta = player.sticker ? STICKER_META[player.sticker] : null;
  return <article className={`player-card compact ${suspicion ? 'suspected' : ''}`}><div className="sticker" aria-hidden="true">{meta?.emoji ?? '…'}</div><p className="player-seat">{player.seat === 'seat_a' ? 'Player A' : 'Player B'}</p><h2>{meta?.label ?? 'Waiting for a player…'}</h2>{meta && <span className="ready-badge">{player.answered ? '✓ Answer locked' : player.ready ? '✓ Ready' : 'Waiting'}</span>}{suspicion && <div className="suspicion-sticker">Suspicious!</div>}<div className="trait-list">{player.traits.map((trait) => <span key={trait.id}>{trait.text}{trait.feedback && <small> · {trait.feedback === 'thats_me' ? 'That’s me' : 'Not me'}</small>}</span>)}</div></article>;
}

function CenterStage({ game }: { game: PublicGameSnapshot }) {
  if (game.result) return <ResultStage game={game} />;
  if (game.revealAtMs) return <DetectiveStage checkpoint="Accusation locked" title="The truth arrives in three…" timerGame={game} />;
  if (game.checkpoint) return <DetectiveStage key={game.checkpoint.id} checkpoint={checkpointCopy(game)} title={checkpointTitle(game)} body="The timer is paused while the Detective thinks." checkpointGame={game} />;
  if (game.currentQuestion) return <div className="question-stage"><h2>{game.currentQuestion.prompt}</h2><Countdown game={game} /><RevealedAnswers game={game} /></div>;
  if (game.phase === 'trait_review') return <DetectiveStage checkpoint="Game in progress" title="Checking the Detective’s profiles" body="Both players are deciding which traits fit them." />;
  if (game.phase === 'role_reveal') return <DetectiveStage checkpoint="Game in progress" title="Checking secret roles" body="Each player is checking their role on their phone." />;
  return <DetectiveStage checkpoint="Game in progress" title="One moment…" />;
}

function DetectiveStage({ checkpoint, title, body, timerGame, checkpointGame }: { checkpoint: string; title: string; body?: string; timerGame?: PublicGameSnapshot; checkpointGame?: PublicGameSnapshot }) {
  const [showResume, setShowResume] = useState(false);
  const [copied, setCopied] = useState(false);
  const checkpointId = checkpointGame?.checkpoint?.id;
  useEffect(() => {
    if (!checkpointId) return;
    const timer = window.setTimeout(() => setShowResume(true), 20_000);
    return () => window.clearTimeout(timer);
  }, [checkpointId]);
  const resumePrompt = checkpointGame
    ? `Resume Can You Be Me? room ${checkpointGame.roomCode}. Call get_public_game_state first, then perform the single eligible action for the current checkpoint.`
    : '';
  const copyResume = async () => {
    await navigator.clipboard.writeText(resumePrompt);
    setCopied(true);
  };
  return <div className="detective-stage"><div className="detective-icon" aria-hidden="true">🕵️</div><p className="checkpoint-label">{checkpoint}</p><h2>{title}</h2>{body && <p className="stage-description">{body}</p>}{timerGame ? <Countdown game={timerGame} /> : <div className="thinking-dots" aria-hidden="true"><i /><i /><i /></div>}{showResume && <div className="resume-card" role="status"><p>The Detective may have been interrupted.</p><button type="button" onClick={() => void copyResume()}>{copied ? 'Resume prompt copied' : 'Copy resume prompt'}</button></div>}</div>;
}

function PlayerView({ game, self, pending, onAction }: { game: PublicGameSnapshot; self: PlayerSelfSnapshot; pending: string | null; onAction(label: string, action: () => Promise<RoomBootstrap>): () => void }) {
  const player = game.players.find((entry) => entry.seat === self.seat)!;
  const meta = player.sticker ? STICKER_META[player.sticker] : null;
  if (game.phase === 'lobby') return <PlayerLobby game={game} player={player} pending={pending} onAction={onAction} />;
  if (game.phase === 'role_reveal') return <RoleReveal game={game} self={self} pending={pending} onAction={onAction} />;
  if (game.phase === 'trait_review' && self.traitFeedbackRequiredIds.length > 0) { const traitId = self.traitFeedbackRequiredIds[0]; const trait = player.traits.find((entry) => entry.id === traitId); return <PhoneAction title={trait?.text ?? 'Does this trait feel right?'} eyebrow={`${meta?.emoji ?? ''} Detective profile`} body="Your reaction stays hidden until both players finish."><div className="choice-grid two"><button type="button" disabled={Boolean(pending)} onClick={onAction('Locking feedback…', () => gameGateway.submitTraitFeedback(game.gameId, traitId, 'thats_me'))}>That’s me</button><button type="button" disabled={Boolean(pending)} onClick={onAction('Locking feedback…', () => gameGateway.submitTraitFeedback(game.gameId, traitId, 'not_me'))}>Not me</button></div></PhoneAction>; }
  if (self.canClaimObjection && game.activeWindowId) return <PhoneAction title="Object before you see the suspicion?" eyebrow="3-second blind window" body="Your team has one shared token. The first tap wins."><button className="objection-button" type="button" disabled={Boolean(pending)} onClick={onAction('Claiming Objection…', () => gameGateway.claimObjection(game.gameId, game.activeWindowId!))}>Objection!</button><Countdown game={game} /></PhoneAction>;
  if (self.canAnswer && game.currentQuestion && game.activeWindowId) return <QuestionChoices game={game} self={self} pending={pending} onAction={onAction} />;
  if (self.selectedOptionId) return <PhoneAction title="Answer locked in" eyebrow={`${meta?.emoji ?? ''} ${meta?.label ?? 'Player'}`} body="Look up at the main screen. Your answer stays hidden until you’ve both answered or time runs out."><div className="locked-curtain" aria-hidden="true">🔒</div></PhoneAction>;
  if (game.result) return <PhoneResult game={game} self={self} />;
  return <PhoneAction title={game.checkpoint ? 'Detective is thinking…' : phaseTitle(game)} eyebrow={`${meta?.emoji ?? ''} ${meta?.label ?? 'Player'}`} body={game.checkpoint ? 'The timer is paused while the Detective thinks.' : 'Look up at the main screen to see what happens next.'}>{game.deadlineMs && <Countdown game={game} />}</PhoneAction>;
}

function PlayerLobby({ game, player, pending, onAction }: { game: PublicGameSnapshot; player: PublicPlayer; pending: string | null; onAction(label: string, action: () => Promise<RoomBootstrap>): () => void }) {
  const meta = player.sticker ? STICKER_META[player.sticker] : null;
  return <PhoneAction title={player.ready ? 'You’re ready!' : 'Ready to be someone else?'} eyebrow={`${meta?.emoji ?? ''} ${meta?.label ?? 'Player'}`} body={player.ready ? 'Waiting for the other player. The game starts automatically when both are ready.' : `Answers use ${game.timerSeconds}-second timers. Keep your screen private.`}><button className="button button-primary full" type="button" disabled={Boolean(pending)} onClick={onAction(player.ready ? 'Updating…' : 'Getting ready…', () => gameGateway.setReady(game.gameId, !player.ready))}>{player.ready ? 'Not ready' : 'I’m ready'}</button></PhoneAction>;
}

function QuestionChoices({ game, self, pending, onAction }: { game: PublicGameSnapshot; self: PlayerSelfSnapshot; pending: string | null; onAction(label: string, action: () => Promise<RoomBootstrap>): () => void }) {
  return <PhoneAction title={game.currentQuestion!.prompt} eyebrow={`${game.currentQuestion!.kind} · Choose one`} body={game.phase === 'challenge' ? 'Original: answer as yourself. Mirror: predict the Original.' : 'Your answer stays hidden until the reveal.'}><Countdown game={game} /><div className="choice-grid">{self.options.map((option) => <button key={option.id} type="button" disabled={Boolean(pending)} onClick={onAction('Locking answer…', () => gameGateway.submitAnswer(game.gameId, game.activeWindowId!, option.id))}>{option.label}</button>)}</div></PhoneAction>;
}

function RoleReveal({ game, self, pending, onAction }: { game: PublicGameSnapshot; self: PlayerSelfSnapshot; pending: string | null; onAction(label: string, action: () => Promise<RoomBootstrap>): () => void }) {
  const [revealed, setRevealed] = useState(false);
  const hide = useCallback(() => setRevealed(false), []);
  useEffect(() => { document.addEventListener('visibilitychange', hide); window.addEventListener('blur', hide); return () => { document.removeEventListener('visibilitychange', hide); window.removeEventListener('blur', hide); }; }, [hide]);
  if (self.roleAcknowledged) return <PhoneAction title="Role locked" eyebrow="Keep it secret" body="Waiting for the other player to check their role." />;
  return <PhoneAction focusKey="role-reveal" title={revealed ? (self.role === 'original' ? 'You are the Original' : 'You are the Mirror') : 'Your secret role'} eyebrow="Private role" body={revealed ? (self.role === 'original' ? 'Answer Challenge questions as yourself.' : 'Predict how the Original will answer.') : 'Keep your screen hidden from the other player. Release to hide your role.'}><button type="button" className={`role-hold ${revealed ? 'revealed' : ''}`} onPointerDown={() => setRevealed(true)} onPointerUp={hide} onPointerCancel={hide} onPointerLeave={hide} onKeyDown={(event) => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); setRevealed(true); } }} onKeyUp={hide}>{revealed ? (self.role === 'original' ? '✨ Original' : '🪞 Mirror') : 'Hold to reveal'}</button>{revealed && <button type="button" className="button button-primary full" disabled={Boolean(pending)} onClick={onAction('Locking role…', () => gameGateway.acknowledgeRole(game.gameId))}>I know my role</button>}</PhoneAction>;
}

function PhoneAction({ eyebrow, title, body, focusKey = title, children }: { eyebrow: string; title: string; body: string; focusKey?: string; children?: React.ReactNode }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  // Role peeks update the title without moving focus away from the held button.
  useEffect(() => { headingRef.current?.focus(); }, [focusKey]);
  return <section className="phone-panel action-screen"><p className="eyebrow">{eyebrow}</p><h1 ref={headingRef} tabIndex={-1}>{title}</h1><p>{body}</p>{children}</section>;
}

function Countdown({ game }: { game: PublicGameSnapshot }) {
  const [seconds, setSeconds] = useState<number | null>(null);
  const advancedWindow = useRef<string | null>(null);
  const clock = useMemo<ServerClock>(() => { const now = monotonicNowMs(); return measureServerClock(game.serverNowMs, now, now); }, [game.serverNowMs]);
  useEffect(() => { const tick = () => { const next = displaySeconds(remainingMs(game.deadlineMs ?? game.revealAtMs, clock)); setSeconds(next); if (next === 0 && game.activeWindowId && advancedWindow.current !== game.activeWindowId) { advancedWindow.current = game.activeWindowId; void gameGateway.advanceIfDue(game.gameId, game.activeWindowId).catch(() => undefined); } }; tick(); const timer = window.setInterval(tick, 200); return () => window.clearInterval(timer); }, [clock, game.activeWindowId, game.deadlineMs, game.gameId, game.revealAtMs]);
  if (seconds === null) return null;
  return <div className={`countdown ${seconds <= 3 ? 'urgent' : ''}`} role="timer" aria-live="off"><strong>{seconds}</strong><span>seconds</span><span className="visually-hidden" aria-live="polite">{seconds === 5 || seconds === 3 || seconds === 0 ? (seconds === 0 ? 'Time’s up' : `${seconds} seconds remaining`) : ''}</span></div>;
}

function RevealedAnswers({ game }: { game: PublicGameSnapshot }) {
  const answers = game.currentQuestion?.revealedAnswers;
  if (!answers || Object.keys(answers).length === 0) return null;
  return <div className="revealed-answers">{(['seat_a', 'seat_b'] as Seat[]).map((seat) => <div key={seat}><span>{seat === 'seat_a' ? 'A' : 'B'}</span><strong>{answers[seat]?.label ?? 'No answer'}</strong></div>)}</div>;
}

function ResultStage({ game }: { game: PublicGameSnapshot }) {
  const humansWon = game.result!.winner === 'humans';
  return <div className="result-stage"><div className="result-sticker" aria-hidden="true">{humansWon ? '🎭' : '🔎'}</div><h2>{humansWon ? 'The humans fooled the Detective!' : 'The Detective caught the Mirror!'}</h2><p>The Original was Player {game.result!.originalSeat === 'seat_a' ? 'A' : 'B'}.</p><ol className="timeline">{game.timeline.slice(-8).map((event) => <li key={event.id}><span>{event.sequence}</span>{event.summary}</li>)}</ol></div>;
}

function PhoneResult({ game, self }: { game: PublicGameSnapshot; self: PlayerSelfSnapshot }) {
  const isOriginal = game.result!.originalSeat === self.seat;
  return <PhoneAction eyebrow="Case closed" title={game.result!.winner === 'humans' ? 'You fooled the Detective!' : 'The Mirror was caught!'} body={`You were the ${isOriginal ? 'Original' : 'Mirror'}.`}><div className="achievement">{isOriginal ? '🏆 Uncopyable Energy' : '🎭 Method Actor'}</div></PhoneAction>;
}

function Progress({ phase, round }: { phase: string; round: number }) {
  return <ol className="progress-strip" aria-label="Game progress"><li className={phase !== 'lobby' ? 'complete' : 'active'}>Learn</li><li className={phase === 'challenge' || phase === 'objection' ? 'active' : phase === 'accuse' || phase === 'revealed' ? 'complete' : ''}>Challenge {round ? `${Math.min(round, 4)}/4` : ''}</li><li className={phase === 'accuse' ? 'active' : phase === 'revealed' ? 'complete' : ''}>Accuse</li></ol>;
}

function phaseTitle(game: PublicGameSnapshot): string {
  const learnTitle = game.currentQuestion?.kind === 'contrast' || game.checkpoint?.kind === 'awaiting_contrast_question'
    ? 'Learn · Extra question'
    : game.currentQuestion?.kind === 'learn' ? `Learn ${game.currentQuestion.ordinal}/5` : 'Learn';
  return ({ lobby: 'Invite both players', learn: learnTitle, trait_review: 'Meet the players', role_reveal: 'Secret roles', challenge: `Challenge ${game.round}/4`, objection: 'Objection!', accuse: 'Final accusation', revealed: 'Case closed' } as Record<string, string>)[game.phase];
}

function checkpointCopy(game: PublicGameSnapshot): string {
  const kind = game.checkpoint?.kind;
  if (kind === 'awaiting_learn_questions') return 'Detective is preparing 5 questions…';
  if (kind === 'awaiting_contrast_question') return 'Detective is preparing a contrast…';
  if (kind === 'awaiting_traits') return 'Detective is profiling both players…';
  if (kind === 'awaiting_challenge_question') return `Detective is preparing Challenge ${game.round}…`;
  if (kind === 'awaiting_suspicion') return 'Detective is placing suspicion…';
  if (kind === 'awaiting_objection_question') return 'Detective is preparing a follow-up…';
  if (kind === 'awaiting_objection_resolution') return 'Detective is reconsidering…';
  return 'Detective is making the final call…';
}

function checkpointTitle(game: PublicGameSnapshot): string {
  const kind = game.checkpoint?.kind;
  if (kind === 'awaiting_learn_questions') return 'First, let’s get to know them.';
  if (kind === 'awaiting_contrast_question') return 'These two are suspiciously similar.';
  if (kind === 'awaiting_traits') return 'What makes each player tick?';
  if (kind === 'awaiting_challenge_question') return `Challenge ${game.round} needs the right question.`;
  if (kind === 'awaiting_suspicion') return 'Where does the evidence point?';
  if (kind === 'awaiting_objection_question') return `A follow-up for ${game.objection.pendingTarget === 'seat_a' ? 'Player A' : 'Player B'}.`;
  if (kind === 'awaiting_objection_resolution') return 'Did the Objection change the case?';
  return 'Original or Mirror?';
}
