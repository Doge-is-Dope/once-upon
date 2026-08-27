import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlayerSelfSnapshot, PublicGameSnapshot, RoomBootstrap } from '@/lib/game/contracts';
import { gameGateway } from '@/lib/game/gateway';
import * as webMcp from '@/lib/webmcp/registry';
import { GameApp } from './game-app';

function game(overrides: Partial<PublicGameSnapshot> = {}): PublicGameSnapshot {
  return {
    gameId: 'test-game', roomCode: 'TEST', mode: 'standard', phase: 'lobby',
    checkpoint: null, revision: 1, sequence: 1, round: 0, timerSeconds: 8,
    serverNowMs: 1_000_000, deadlineMs: null, activeWindowId: null, revealAtMs: null,
    players: [
      { seat: 'seat_a', sticker: 'tiger', ready: true, answered: false, traits: [] },
      { seat: 'seat_b', sticker: 'ghost', ready: true, answered: false, traits: [] },
    ],
    currentQuestion: null, suspicion: null,
    objection: { available: true, claimedBy: null, pendingTarget: null },
    accusation: null, result: null, timeline: [], eligibleEvidence: [],
    eligibleAgentActions: [], questionRequest: null,
    ...overrides,
  };
}

function self(overrides: Partial<PlayerSelfSnapshot> = {}): PlayerSelfSnapshot {
  return {
    seat: 'seat_a', role: null, options: [], canAnswer: false, selectedOptionId: null,
    canClaimObjection: false, traitFeedbackRequiredIds: [], roleAcknowledged: false,
    ...overrides,
  };
}

async function showRoom(publicState: PublicGameSnapshot, selfState: PlayerSelfSnapshot | null = null, viewerKind: RoomBootstrap['viewerKind'] = selfState?.seat ?? 'host') {
  const bootstrap: RoomBootstrap = { publicState, selfState, viewerKind };
  vi.spyOn(gameGateway, 'bootstrapRoom').mockResolvedValue(bootstrap);
  vi.spyOn(gameGateway, 'refresh').mockResolvedValue({ publicState, selfState });
  vi.spyOn(gameGateway, 'advanceIfDue').mockResolvedValue(bootstrap);
  let view!: ReturnType<typeof render>;
  await act(async () => { view = render(<GameApp />); });
  return view;
}

describe('GameApp room guidance', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/?room=TEST');
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance'] });
    vi.spyOn(gameGateway, 'subscribe').mockImplementation(async (_id, _invalidate, onStatus) => {
      onStatus('SUBSCRIBED');
      return () => {};
    });
    vi.spyOn(webMcp, 'bindHostRoom').mockResolvedValue(() => {});
    vi.spyOn(webMcp, 'getWebMcpCapability').mockReturnValue({ supported: false, reason: 'WebMCP is unavailable in this browser.' });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('explains sticker choice once and still marks taken stickers', async () => {
    await showRoom(game(), null, 'join');
    expect(screen.getByRole('heading', { name: 'Choose your sticker' })).toBeInTheDocument();
    expect(screen.getByText('Each player needs a different one.')).toBeInTheDocument();
    expect(screen.queryByText('Choose your identity')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Tiger\s*Taken/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Frog' })).toBeEnabled();
  });

  it('lets a phone join without WebMCP or a compatibility warning', async () => {
    const snapshot = game();
    snapshot.players[0] = { ...snapshot.players[0], sticker: null, ready: false };
    const claim = vi.spyOn(gameGateway, 'claimSeat').mockResolvedValue({
      publicState: { ...snapshot, players: [{ ...snapshot.players[0], sticker: 'frog' }, snapshot.players[1]] },
      viewerKind: 'seat_a', selfState: self(),
    });
    await showRoom(snapshot, null, 'join');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Frog' })); });
    expect(claim).toHaveBeenCalledWith('TEST', 'frog');
    expect(screen.queryByRole('heading', { name: 'Choose your sticker' })).not.toBeInTheDocument();
    expect(document.querySelector('.tooltip-content')).toBeNull();
    expect(webMcp.getWebMcpCapability).not.toHaveBeenCalled();
  });

  it('shows one waiting message per empty seat without losing occupied-seat status', async () => {
    const snapshot = game();
    snapshot.players[1] = { ...snapshot.players[1], sticker: null, ready: false };
    await showRoom(snapshot);
    const [occupied, empty] = screen.getAllByRole('article');
    expect(within(occupied).getByText('Player A')).toBeInTheDocument();
    expect(within(empty).getByText('Player B')).toBeInTheDocument();
    expect(screen.getAllByText('TEST')).toHaveLength(2);
    expect(within(occupied).getByText('✓ Ready')).toBeInTheDocument();
    expect(within(empty).getAllByText(/Waiting/)).toHaveLength(1);
    expect(within(empty).getByRole('heading')).toHaveTextContent('Waiting for a player…');
  });

  it('keeps phase and activity headings separate and delays recovery guidance', async () => {
    await showRoom(game({ phase: 'learn', checkpoint: { id: 'checkpoint-1', kind: 'awaiting_learn_questions' } }));
    expect(screen.getByRole('heading', { level: 1, name: 'Learn' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { name: 'First, let’s get to know them.' })).toHaveLength(1);
    expect(screen.getByText('The timer is paused while the Detective thinks.')).toBeInTheDocument();
    expect(screen.getByText('Detective is preparing 5 questions…')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Copy resume prompt' })).not.toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(19_999); });
    expect(screen.queryByText('The Detective may have been interrupted.')).not.toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(screen.getByRole('status')).toHaveTextContent('The Detective may have been interrupted.');
    expect(screen.getByRole('button', { name: 'Copy resume prompt' })).toBeEnabled();
  });

  it.each([
    ['trait_review', 'Meet the players', 'Checking the Detective’s profiles', 'Both players are deciding which traits fit them.'],
    ['role_reveal', 'Secret roles', 'Checking secret roles', 'Each player is checking their role on their phone.'],
  ] as const)('explains what players are doing during %s', async (phase, heading, activity, body) => {
    await showRoom(game({ phase }));
    expect(screen.getByRole('heading', { level: 1, name: heading })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: activity })).toBeInTheDocument();
    expect(screen.getByText(body)).toBeInTheDocument();
    expect(screen.queryByText(/durable state transition/)).not.toBeInTheDocument();
  });

  it('uses a short fallback without an empty description', async () => {
    const { container } = await showRoom(game({ phase: 'accuse' }));
    expect(screen.getByRole('heading', { name: 'Final accusation' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'One moment…' })).toBeInTheDocument();
    expect(container.querySelectorAll('p:empty')).toHaveLength(0);
  });

  it.each(['learn', 'challenge', 'contrast'] as const)('keeps %s round context in the page heading, not above the question', async (kind) => {
    const { container } = await showRoom(game({
      phase: kind === 'challenge' ? 'challenge' : 'learn', round: 2,
      currentQuestion: { id: 'question-1', kind, ordinal: kind === 'contrast' ? 1 : 2, prompt: 'What would you order?' },
    }));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(kind === 'contrast' ? 'Learn · Extra question' : kind === 'learn' ? 'Learn 2/5' : 'Challenge 2/4');
    expect(screen.getByRole('heading', { name: 'What would you order?' })).toBeInTheDocument();
    expect(container.querySelector('.question-stage .eyebrow')).not.toBeInTheDocument();
  });

  it('keeps the accusation countdown without technical or empty helper copy', async () => {
    const { container } = await showRoom(game({ phase: 'accuse', revealAtMs: 1_003_000, deadlineMs: 1_003_000, activeWindowId: 'verdict' }));
    expect(screen.getByText('Accusation locked')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'The truth arrives in three…' })).toBeInTheDocument();
    expect(screen.getByRole('timer')).toHaveTextContent('3');
    expect(screen.queryByText(/server countdown|Roles are sealed/)).not.toBeInTheDocument();
    expect(container.querySelectorAll('p:empty')).toHaveLength(0);
  });

  it('shows the result without repeating Case closed', async () => {
    await showRoom(game({ phase: 'revealed', result: { originalSeat: 'seat_a', mirrorSeat: 'seat_b', winner: 'humans' } }));
    expect(screen.getAllByText('Case closed')).toHaveLength(1);
    expect(screen.getByRole('heading', { name: 'The humans fooled the Detective!' })).toBeInTheDocument();
    expect(screen.getByText('The Original was Player A.')).toBeInTheDocument();
  });

  it('moves from an answer choice to clear saved-answer guidance using the keyboard', async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    const snapshot = game({ phase: 'learn', activeWindowId: 'answer-1', currentQuestion: { id: 'question-1', kind: 'learn', ordinal: 1, prompt: 'What would you order?' } });
    const player = self({ canAnswer: true, options: [{ id: 'pizza', label: 'Pizza' }, { id: 'sushi', label: 'Sushi' }] });
    vi.spyOn(gameGateway, 'submitAnswer').mockResolvedValue({ publicState: snapshot, viewerKind: 'seat_a', selfState: { ...player, canAnswer: false, selectedOptionId: 'pizza' } });
    await showRoom(snapshot, player);
    expect(screen.getByText('Your answer stays hidden until the reveal.')).toBeInTheDocument();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Pizza' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(gameGateway.submitAnswer).toHaveBeenCalledWith('test-game', 'answer-1', 'pizza');
    expect(screen.getByRole('heading', { name: 'Answer locked in' })).toHaveFocus();
    expect(screen.getByText('🐯 Tiger')).toBeInTheDocument();
    expect(screen.getByText('Look up at the main screen. Your answer stays hidden until you’ve both answered or time runs out.')).toBeInTheDocument();
    expect(screen.queryByText('Pizza')).not.toBeInTheDocument();
    expect(screen.queryByText('Answer saved')).not.toBeInTheDocument();
    expect(webMcp.getWebMcpCapability).not.toHaveBeenCalled();
    expect(document.querySelector('.tooltip-content')).toBeNull();
  });

  it('uses the same paused-timer guidance on the phone', async () => {
    await showRoom(game({ phase: 'challenge', checkpoint: { id: 'checkpoint-2', kind: 'awaiting_challenge_question' } }), self());
    expect(screen.getByRole('heading', { name: 'Detective is thinking…' })).toBeInTheDocument();
    expect(screen.getByText('The timer is paused while the Detective thinks.')).toBeInTheDocument();
  });

  it('directs a waiting player to the main screen', async () => {
    await showRoom(game({ phase: 'trait_review' }), self());
    expect(screen.getByText('Look up at the main screen to see what happens next.')).toBeInTheDocument();
    expect(screen.queryByText(/Host Board/)).not.toBeInTheDocument();
  });

  it('keeps trait-feedback privacy guidance in everyday language', async () => {
    const snapshot = game({ phase: 'trait_review' });
    snapshot.players[0].traits = [{ id: 'trait-1', text: 'Always up for an adventure', feedback: null }];
    await showRoom(snapshot, self({ traitFeedbackRequiredIds: ['trait-1'] }));
    expect(screen.getByText('Your reaction stays hidden until both players finish.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'That’s me' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Not me' })).toBeEnabled();
  });

  it.each(['original', 'mirror'] as const)('shows the %s role only while held and preserves role instructions', async (role) => {
    await showRoom(game({ phase: 'role_reveal' }), self({ role }));
    expect(screen.getByRole('heading', { name: 'Your secret role' })).toBeInTheDocument();
    expect(screen.getByText('Keep your screen hidden from the other player. Release to hide your role.')).toBeInTheDocument();
    const hold = screen.getByRole('button', { name: 'Hold to reveal' });
    fireEvent.pointerDown(hold);
    expect(screen.getByRole('heading', { name: role === 'original' ? 'You are the Original' : 'You are the Mirror' })).toBeInTheDocument();
    expect(screen.getByText(role === 'original' ? 'Answer Challenge questions as yourself.' : 'Predict how the Original will answer.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'I know my role' })).toBeEnabled();
    fireEvent.pointerUp(hold);
    expect(screen.getByRole('heading', { name: 'Your secret role' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'I know my role' })).not.toBeInTheDocument();
  });

  it.each(['Enter', 'Space'])('hides the role when the %s key is released', async (key) => {
    vi.useRealTimers();
    const user = userEvent.setup();
    await showRoom(game({ phase: 'role_reveal' }), self({ role: 'mirror' }));
    await user.tab();
    const hold = screen.getByRole('button', { name: 'Hold to reveal' });
    expect(hold).toHaveFocus();
    await user.keyboard(`[${key}>]`);
    expect(screen.getByRole('heading', { name: 'You are the Mirror' })).toBeInTheDocument();
    expect(hold).toHaveFocus();
    await user.keyboard(`[/${key}]`);
    expect(screen.getByRole('heading', { name: 'Your secret role' })).toBeInTheDocument();
  });

  it('hides a held role when the window loses focus', async () => {
    await showRoom(game({ phase: 'role_reveal' }), self({ role: 'mirror' }));
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Hold to reveal' }));
    fireEvent.blur(window);
    expect(screen.queryByRole('heading', { name: 'You are the Mirror' })).not.toBeInTheDocument();
  });

  it.each(['pointerCancel', 'pointerLeave', 'visibilityChange'] as const)('still hides a held role on %s', async (event) => {
    await showRoom(game({ phase: 'role_reveal' }), self({ role: 'mirror' }));
    const hold = screen.getByRole('button', { name: 'Hold to reveal' });
    fireEvent.pointerDown(hold);
    if (event === 'visibilityChange') fireEvent(document, new Event('visibilitychange'));
    else fireEvent[event](hold);
    expect(screen.queryByRole('heading', { name: 'You are the Mirror' })).not.toBeInTheDocument();
  });

  it('explains the wait after acknowledging a role', async () => {
    await showRoom(game({ phase: 'role_reveal' }), self({ role: 'mirror', roleAcknowledged: true }));
    expect(screen.getByText('Keep it secret')).toBeInTheDocument();
    expect(screen.getByText('Waiting for the other player to check their role.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Hold to reveal' })).not.toBeInTheDocument();
  });

  it('preserves the shared Objection limit and countdown', async () => {
    await showRoom(game({ phase: 'objection', deadlineMs: 1_003_000, activeWindowId: 'objection-1' }), self({ canClaimObjection: true }));
    expect(screen.getByText('3-second blind window')).toBeInTheDocument();
    expect(screen.getByText('Your team has one shared token. The first tap wins.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Objection!' })).toBeEnabled();
    expect(screen.getByRole('timer')).toHaveTextContent('3');
  });

  it('preserves the ready-state explanation and automatic start', async () => {
    await showRoom(game(), self());
    expect(screen.getByRole('heading', { name: 'You’re ready!' })).toBeInTheDocument();
    expect(screen.getByText('Waiting for the other player. The game starts automatically when both are ready.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Not ready' })).toBeEnabled();
  });

  it('keeps countdown announcements at five, three and zero seconds', async () => {
    await showRoom(game({ phase: 'challenge', deadlineMs: 1_008_000, activeWindowId: 'answer-1', currentQuestion: { id: 'question-1', kind: 'challenge', ordinal: 1, prompt: 'What would you order?' } }), self({ canAnswer: true }));
    expect(screen.getByText('Original: answer as yourself. Mirror: predict the Original.')).toBeInTheDocument();
    const timer = screen.getByRole('timer');
    expect(within(timer).getByText('seconds', { exact: true })).toBeInTheDocument();
    const announcement = timer.querySelector('[aria-live="polite"]');
    expect(timer).toHaveAttribute('aria-live', 'off');
    expect(announcement).toBeEmptyDOMElement();
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
    expect(announcement).toHaveTextContent('5 seconds remaining');
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    expect(announcement).toBeEmptyDOMElement();
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    expect(announcement).toHaveTextContent('3 seconds remaining');
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
    expect(announcement).toHaveTextContent('Time’s up');
    expect(gameGateway.advanceIfDue).toHaveBeenCalledExactlyOnceWith('test-game', 'answer-1');
  });
});
