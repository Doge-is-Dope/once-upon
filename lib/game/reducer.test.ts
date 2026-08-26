import { describe, expect, it } from 'vitest';
import { initialRoomState, roomReducer } from './reducer';
import type { RoomBootstrap } from './contracts';

function bootstrap(revision: number): RoomBootstrap {
  return {
    viewerKind: 'host',
    selfState: null,
    publicState: {
      gameId: 'game', roomCode: 'ABCD', mode: 'standard', phase: 'lobby', checkpoint: null,
      revision, sequence: revision, round: 0, timerSeconds: 8, serverNowMs: 0, deadlineMs: null,
      activeWindowId: null, revealAtMs: null,
      players: [
        { seat: 'seat_a', sticker: null, ready: false, answered: false, traits: [] },
        { seat: 'seat_b', sticker: null, ready: false, answered: false, traits: [] },
      ],
      currentQuestion: null, suspicion: null,
      objection: { available: true, claimedBy: null, pendingTarget: null },
      accusation: null, result: null, timeline: [], eligibleEvidence: [], eligibleAgentActions: [], questionRequest: null,
    },
  };
}

describe('roomReducer', () => {
  it('replaces snapshots monotonically', () => {
    const ready = roomReducer(initialRoomState, { type: 'bootstrapped', payload: bootstrap(3) });
    const stale = roomReducer(ready, { type: 'snapshot', payload: { publicState: bootstrap(2).publicState } });
    expect(stale.bootstrap?.publicState.revision).toBe(3);
    const fresh = roomReducer(ready, { type: 'snapshot', payload: { publicState: bootstrap(4).publicState } });
    expect(fresh.bootstrap?.publicState.revision).toBe(4);
  });
});
