'use client';

import { QRCodeSVG } from 'qrcode.react';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
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
  const [timerSeconds, setTimerSeconds] = useState<8 | 15>(8);
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
    ).then((cleanup) => { unsubscribe = cleanup; });
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

  if (!roomCode) return <Landing timerSeconds={timerSeconds} onTimerChange={setTimerSeconds} onCreate={createRoom} pending={state.pendingAction} error={state.error} />;
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
      {roomCode ? <span className="room-pill">Room <strong>{roomCode}</strong></span> : <span className="live-pill"><span aria-hidden="true" /> Detective game</span>}
    </header>
  );
}

function Landing({ timerSeconds, onTimerChange, onCreate, pending, error }: { timerSeconds: 8 | 15; onTimerChange(value: 8 | 15): void; onCreate(mode: GameMode): void; pending: string | null; error: string | null }) {
  return <main id="content" className="game-shell" tabIndex={-1}><BrandHeader /><section className="hero" aria-labelledby="game-title"><p className="eyebrow">Two friends. One secret Mirror.</p><h1 id="game-title">Can ChatGPT tell<br />who is being real?</h1><p className="lede">Answer in private. Bluff in public. Let the Detective decide who is the Original—and who is only pretending.</p><fieldset className="timer-choice"><legend>Answer timer</legend><label><input type="radio" name="timer" checked={timerSeconds === 8} onChange={() => onTimerChange(8)} /> 8 seconds</label><label><input type="radio" name="timer" checked={timerSeconds === 15} onChange={() => onTimerChange(15)} /> Extended — 15 seconds</label></fieldset><div className="hero-actions"><button className="button button-primary" type="button" onClick={() => onCreate('standard')} disabled={Boolean(pending)}>{pending ?? 'Create a room'}</button><button className="button button-secondary" type="button" onClick={() => onCreate('demo')} disabled={Boolean(pending)}>Try Demo Room</button></div>{error && <p className="error-banner" role="alert">{error}</p>}<p className="helper">You’ll need this screen and two phones. No accounts or text entry.</p></section><PreviewBoard /><footer><p>Built for the WebMCP Challenge · Private answers stay private until reveal.</p></footer></main>;
}

function PreviewBoard() {
  const players = [{ seat: 'Player A', sticker: '🐯', name: 'Tiger', trait: 'Bold planner' }, { seat: 'Player B', sticker: '👻', name: 'Ghost', trait: 'Quiet wildcard' }];
  return <section className="board-preview" aria-labelledby="preview-title"><div className="board-topline"><div><p className="eyebrow">Live game preview</p><h2 id="preview-title">Detective checkpoint</h2></div><Progress phase="challenge" round={3} /></div><div className="board-grid">{players.map((player) => <article className="player-card" key={player.seat}><div className="sticker" aria-hidden="true">{player.sticker}</div><p className="player-seat">{player.seat}</p><h3>{player.name}</h3><span className="ready-badge">✓ Ready</span><div className="trait-list"><span>{player.trait}</span><span>{player.name === 'Tiger' ? 'Snack loyalist' : 'Last-minute energy'}</span></div></article>)}<DetectiveStage checkpoint="Detective is thinking…" title="Who chose “leave at sunrise” for the right reason?" body="Timers are paused while ChatGPT reviews the public evidence." /></div></section>;
}

function LoadingScreen({ roomCode, message, error }: { roomCode: string; message: string; error: string | null }) {
  return <main className="game-shell"><BrandHeader roomCode={roomCode} /><section className="solo-panel" role="status"><div className="detective-icon">🕵️</div><h1>{message}</h1>{error && <p className="error-banner" role="alert">{error}</p>}</section></main>;
}

function JoinRoom({ bootstrap, pending, error, onJoin }: { bootstrap: RoomBootstrap; pending: string | null; error: string | null; onJoin(sticker: Sticker): void }) {
  const used = new Set(bootstrap.publicState.players.map((player) => player.sticker).filter(Boolean));
  return <main className="game-shell phone-shell"><BrandHeader roomCode={bootstrap.publicState.roomCode} /><section className="phone-panel"><p className="eyebrow">Choose your identity</p><h1>Who are you today?</h1><p>Pick one sticker. The other player can’t use the same one.</p><div className="sticker-picker">{STICKERS.map((sticker) => { const meta = STICKER_META[sticker]; const disabled = used.has(sticker); return <button key={sticker} type="button" disabled={disabled || Boolean(pending)} onClick={() => onJoin(sticker)}><span aria-hidden="true">{meta.emoji}</span><strong>{meta.label}</strong>{disabled && <small>Taken</small>}</button>; })}</div>{pending && <p role="status">{pending}</p>}{error && <p className="error-banner" role="alert">{error}</p>}</section></main>;
}

function RoomExperience({ bootstrap, connection, pending, error, onAction }: { bootstrap: RoomBootstrap; connection: string; pending: string | null; error: string | null; onAction(label: string, action: () => Promise<RoomBootstrap>): Promise<void> }) {
  const { publicState, selfState, viewerKind } = bootstrap;
  const action = (label: string, fn: () => Promise<RoomBootstrap>) => () => void onAction(label, fn);
  return <main className={`game-shell ${viewerKind === 'host' ? 'host-shell' : 'phone-shell'}`}><BrandHeader roomCode={publicState.roomCode} />{connection !== 'connected' && <div className="connection-banner" role="status">Reconnecting… Your seat is safe.</div>}{viewerKind === 'host' ? <HostBoard game={publicState} pending={pending} onAction={action} /> : <PlayerView game={publicState} self={selfState!} pending={pending} onAction={action} />}{error && <p className="error-banner floating-error" role="alert">{error}</p>}</main>;
}

function HostBoard({ game, pending, onAction }: { game: PublicGameSnapshot; pending: string | null; onAction(label: string, action: () => Promise<RoomBootstrap>): () => void }) {
  const joinUrl = typeof window === 'undefined' ? '' : `${window.location.origin}/?room=${game.roomCode}`;
  return <section className="host-board" aria-labelledby="board-title"><div className="board-topline"><div><p className="eyebrow">Host board · {game.mode === 'demo' ? 'Demo Room' : 'Live Room'}</p><h1 id="board-title">{phaseTitle(game)}</h1></div><Progress phase={game.phase} round={game.round} /></div>{game.phase === 'lobby' ? <LobbyBoard game={game} joinUrl={joinUrl} pending={pending} onAction={onAction} /> : <ActiveBoard game={game} />}</section>;
}

function LobbyBoard({ game, joinUrl, pending, onAction }: { game: PublicGameSnapshot; joinUrl: string; pending: string | null; onAction(label: string, action: () => Promise<RoomBootstrap>): () => void }) {
  return <div className="lobby-layout"><div className="join-card"><div className="qr-wrap">{joinUrl && <QRCodeSVG value={joinUrl} size={180} level="M" />}</div><p>Scan with both phones</p><strong className="big-code">{game.roomCode}</strong><button type="button" className="text-button" onClick={() => void navigator.clipboard.writeText(joinUrl)}>Copy join link</button></div><div className="lobby-players">{game.players.map((player) => <PlayerSummary key={player.seat} player={player} />)}<label className="toggle-row"><input type="checkbox" checked={game.timerSeconds === 15} disabled={game.players.some((player) => player.ready) || Boolean(pending)} onChange={(event) => void onAction('Updating timer…', () => gameGateway.setTimerMode(game.gameId, event.target.checked ? 15 : 8))()} /><span><strong>Extended answer time</strong><small>{game.timerSeconds === 15 ? '15 seconds' : '8 seconds'}</small></span></label></div></div>;
}

function ActiveBoard({ game }: { game: PublicGameSnapshot }) {
  return <div className="active-board"><PlayerSummary player={game.players[0]} suspicion={game.suspicion?.targetSeat === 'seat_a'} /><CenterStage game={game} /><PlayerSummary player={game.players[1]} suspicion={game.suspicion?.targetSeat === 'seat_b'} /></div>;
}

function PlayerSummary({ player, suspicion = false }: { player: PublicPlayer; suspicion?: boolean }) {
  const meta = player.sticker ? STICKER_META[player.sticker] : null;
  return <article className={`player-card compact ${suspicion ? 'suspected' : ''}`}><div className="sticker" aria-hidden="true">{meta?.emoji ?? '…'}</div><p className="player-seat">{player.seat === 'seat_a' ? 'Player A' : 'Player B'}</p><h2>{meta?.label ?? 'Waiting…'}</h2><span className="ready-badge">{player.answered ? '✓ Answer locked' : player.ready ? '✓ Ready' : 'Waiting'}</span>{suspicion && <div className="suspicion-sticker">Suspicious!</div>}<div className="trait-list">{player.traits.map((trait) => <span key={trait.id}>{trait.text}{trait.feedback && <small> · {trait.feedback === 'thats_me' ? 'That’s me' : 'Not me'}</small>}</span>)}</div></article>;
}

function CenterStage({ game }: { game: PublicGameSnapshot }) {
  if (game.result) return <ResultStage game={game} />;
  if (game.revealAtMs) return <DetectiveStage checkpoint="Accusation locked" title="The truth arrives in three…" body="Roles are sealed until the server countdown finishes." timerGame={game} />;
  if (game.checkpoint) return <DetectiveStage key={game.checkpoint.id} checkpoint={checkpointCopy(game)} title={checkpointTitle(game)} body="Player timers are paused. ChatGPT can resume from the current public state at any time." checkpointGame={game} />;
  if (game.currentQuestion) return <div className="question-stage"><p className="eyebrow">{game.currentQuestion.kind} · {game.currentQuestion.ordinal}</p><h2>{game.currentQuestion.prompt}</h2><Countdown game={game} /><RevealedAnswers game={game} /></div>;
  return <DetectiveStage checkpoint="Game in progress" title={phaseTitle(game)} body="Waiting for the next durable state transition." />;
}

function DetectiveStage({ checkpoint, title, body, timerGame, checkpointGame }: { checkpoint: string; title: string; body: string; timerGame?: PublicGameSnapshot; checkpointGame?: PublicGameSnapshot }) {
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
  return <div className="detective-stage"><div className="detective-icon" aria-hidden="true">🕵️</div><p className="checkpoint-label">{checkpoint}</p><h2>{title}</h2><p>{body}</p>{timerGame ? <Countdown game={timerGame} /> : <div className="thinking-dots" aria-hidden="true"><i /><i /><i /></div>}{showResume && <div className="resume-card" role="status"><p>The Detective may have been interrupted.</p><button type="button" onClick={() => void copyResume()}>{copied ? 'Resume prompt copied' : 'Copy resume prompt'}</button></div>}</div>;
}

function PlayerView({ game, self, pending, onAction }: { game: PublicGameSnapshot; self: PlayerSelfSnapshot; pending: string | null; onAction(label: string, action: () => Promise<RoomBootstrap>): () => void }) {
  const player = game.players.find((entry) => entry.seat === self.seat)!;
  const meta = player.sticker ? STICKER_META[player.sticker] : null;
  if (game.phase === 'lobby') return <PlayerLobby game={game} player={player} pending={pending} onAction={onAction} />;
  if (game.phase === 'role_reveal') return <RoleReveal game={game} self={self} pending={pending} onAction={onAction} />;
  if (game.phase === 'trait_review' && self.traitFeedbackRequiredIds.length > 0) { const traitId = self.traitFeedbackRequiredIds[0]; const trait = player.traits.find((entry) => entry.id === traitId); return <PhoneAction title={trait?.text ?? 'Does this trait feel right?'} eyebrow={`${meta?.emoji ?? ''} Detective profile`} body="Your reaction stays sealed until both players finish."><div className="choice-grid two"><button type="button" disabled={Boolean(pending)} onClick={onAction('Locking feedback…', () => gameGateway.submitTraitFeedback(game.gameId, traitId, 'thats_me'))}>That’s me</button><button type="button" disabled={Boolean(pending)} onClick={onAction('Locking feedback…', () => gameGateway.submitTraitFeedback(game.gameId, traitId, 'not_me'))}>Not me</button></div></PhoneAction>; }
  if (self.canClaimObjection && game.activeWindowId) return <PhoneAction title="Object before you see the suspicion?" eyebrow="3-second blind window" body="Your team has one shared token. The first tap wins."><button className="objection-button" type="button" disabled={Boolean(pending)} onClick={onAction('Claiming Objection…', () => gameGateway.claimObjection(game.gameId, game.activeWindowId!))}>Objection!</button><Countdown game={game} /></PhoneAction>;
  if (self.canAnswer && game.currentQuestion && game.activeWindowId) return <QuestionChoices game={game} self={self} pending={pending} onAction={onAction} />;
  if (self.selectedOptionId) return <PhoneAction title="Locked — look up" eyebrow={`${meta?.emoji ?? ''} Answer saved`} body="Your choice is sealed. It will appear only when both players lock or time runs out."><div className="locked-curtain" aria-hidden="true">🔒</div></PhoneAction>;
  if (game.result) return <PhoneResult game={game} self={self} />;
  return <PhoneAction title={game.checkpoint ? 'Detective is thinking…' : phaseTitle(game)} eyebrow={`${meta?.emoji ?? ''} ${meta?.label ?? 'Player'}`} body={game.checkpoint ? 'Timers are paused. Keep this screen open.' : 'Look up at the Host Board for the public reveal.'}>{game.deadlineMs && <Countdown game={game} />}</PhoneAction>;
}

function PlayerLobby({ game, player, pending, onAction }: { game: PublicGameSnapshot; player: PublicPlayer; pending: string | null; onAction(label: string, action: () => Promise<RoomBootstrap>): () => void }) {
  const meta = player.sticker ? STICKER_META[player.sticker] : null;
  return <PhoneAction title={player.ready ? 'You’re ready!' : 'Ready to be someone else?'} eyebrow={`${meta?.emoji ?? ''} ${meta?.label ?? 'Player'}`} body={player.ready ? 'Waiting for the other player. The game starts automatically when both are ready.' : `Answers use ${game.timerSeconds}-second timers. Keep your screen private.`}><button className="button button-primary full" type="button" disabled={Boolean(pending)} onClick={onAction(player.ready ? 'Updating…' : 'Getting ready…', () => gameGateway.setReady(game.gameId, !player.ready))}>{player.ready ? 'Not ready' : 'I’m ready'}</button></PhoneAction>;
}

function QuestionChoices({ game, self, pending, onAction }: { game: PublicGameSnapshot; self: PlayerSelfSnapshot; pending: string | null; onAction(label: string, action: () => Promise<RoomBootstrap>): () => void }) {
  return <PhoneAction title={game.currentQuestion!.prompt} eyebrow={`${game.currentQuestion!.kind} · Choose one`} body={game.phase === 'challenge' ? 'Original: answer as yourself. Mirror: predict the Original.' : 'Your answer stays sealed until reveal.'}><Countdown game={game} /><div className="choice-grid">{self.options.map((option) => <button key={option.id} type="button" disabled={Boolean(pending)} onClick={onAction('Locking answer…', () => gameGateway.submitAnswer(game.gameId, game.activeWindowId!, option.id))}>{option.label}</button>)}</div></PhoneAction>;
}

function RoleReveal({ game, self, pending, onAction }: { game: PublicGameSnapshot; self: PlayerSelfSnapshot; pending: string | null; onAction(label: string, action: () => Promise<RoomBootstrap>): () => void }) {
  const [revealed, setRevealed] = useState(false);
  const hide = useCallback(() => setRevealed(false), []);
  useEffect(() => { document.addEventListener('visibilitychange', hide); window.addEventListener('blur', hide); return () => { document.removeEventListener('visibilitychange', hide); window.removeEventListener('blur', hide); }; }, [hide]);
  if (self.roleAcknowledged) return <PhoneAction title="Role locked" eyebrow="Keep it secret" body="Waiting for the other player to finish their private reveal." />;
  return <PhoneAction title={revealed ? (self.role === 'original' ? 'You are the Original' : 'You are the Mirror') : 'Press and hold to reveal'} eyebrow="Private role" body={revealed ? (self.role === 'original' ? 'Answer Challenge questions as yourself.' : 'Predict how the Original will answer.') : 'Cover your screen. Your role hides as soon as you release.'}><button type="button" className={`role-hold ${revealed ? 'revealed' : ''}`} onPointerDown={() => setRevealed(true)} onPointerUp={hide} onPointerCancel={hide} onPointerLeave={hide} onKeyDown={(event) => { if (event.key === ' ' || event.key === 'Enter') setRevealed(true); }} onKeyUp={hide}>{revealed ? (self.role === 'original' ? '✨ Original' : '🪞 Mirror') : 'Hold to peek'}</button>{revealed && <button type="button" className="button button-primary full" disabled={Boolean(pending)} onClick={onAction('Locking role…', () => gameGateway.acknowledgeRole(game.gameId))}>I know my role</button>}</PhoneAction>;
}

function PhoneAction({ eyebrow, title, body, children }: { eyebrow: string; title: string; body: string; children?: React.ReactNode }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { headingRef.current?.focus(); }, [title]);
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
  return <div className="result-stage"><div className="result-sticker" aria-hidden="true">{humansWon ? '🎭' : '🔎'}</div><p className="eyebrow">Case closed</p><h2>{humansWon ? 'The humans fooled the Detective!' : 'The Detective caught the Mirror!'}</h2><p>The Original was Player {game.result!.originalSeat === 'seat_a' ? 'A' : 'B'}.</p><ol className="timeline">{game.timeline.slice(-8).map((event) => <li key={event.id}><span>{event.sequence}</span>{event.summary}</li>)}</ol></div>;
}

function PhoneResult({ game, self }: { game: PublicGameSnapshot; self: PlayerSelfSnapshot }) {
  const isOriginal = game.result!.originalSeat === self.seat;
  return <PhoneAction eyebrow="Case closed" title={game.result!.winner === 'humans' ? 'You fooled the Detective!' : 'The Mirror was caught!'} body={`You were the ${isOriginal ? 'Original' : 'Mirror'}.`}><div className="achievement">{isOriginal ? '🏆 Uncopyable Energy' : '🎭 Method Actor'}</div></PhoneAction>;
}

function Progress({ phase, round }: { phase: string; round: number }) {
  return <ol className="progress-strip" aria-label="Game progress"><li className={phase !== 'lobby' ? 'complete' : 'active'}>Learn</li><li className={phase === 'challenge' || phase === 'objection' ? 'active' : phase === 'accuse' || phase === 'revealed' ? 'complete' : ''}>Challenge {round ? `${Math.min(round, 4)}/4` : ''}</li><li className={phase === 'accuse' ? 'active' : phase === 'revealed' ? 'complete' : ''}>Accuse</li></ol>;
}

function phaseTitle(game: PublicGameSnapshot): string {
  if (game.checkpoint) return checkpointTitle(game);
  return ({ lobby: 'Invite both players', learn: `Learn ${Math.max(game.currentQuestion?.ordinal ?? 1, 1)}/5`, trait_review: 'Meet the players', role_reveal: 'Secret roles', challenge: `Challenge ${game.round}/4`, objection: 'Objection!', accuse: 'Final accusation', revealed: 'Case closed' } as Record<string, string>)[game.phase];
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
