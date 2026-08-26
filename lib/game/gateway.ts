'use client';

import type { RealtimeChannel } from '@supabase/supabase-js';
import { ensureAnonymousSession, getSupabaseClient } from '@/lib/supabase/client';
import type {
  GameMode,
  PlayerSelfSnapshot,
  PublicEvent,
  PublicGameSnapshot,
  QuestionDraft,
  RoomBootstrap,
  Seat,
  Sticker,
  ToolResult,
} from './contracts';

type Json = string | number | boolean | null | Json[] | { [key: string]: Json | undefined };

export class GameGateway {
  private async rpc<T>(name: string, args: Record<string, Json> = {}): Promise<T> {
    await ensureAnonymousSession();
    const client = getSupabaseClient();
    const { data, error } = await client.schema('api').rpc(name, args);
    if (error) throw new Error(error.message);
    return data as T;
  }

  createRoom(mode: GameMode, timerSeconds: 8 | 15): Promise<RoomBootstrap> {
    return this.rpc('create_game', { p_mode: mode, p_timer_seconds: timerSeconds });
  }

  bootstrapRoom(roomCode: string): Promise<RoomBootstrap> {
    return this.rpc('bootstrap_room', { p_room_code: roomCode.toUpperCase() });
  }

  claimSeat(roomCode: string, sticker: Sticker): Promise<RoomBootstrap> {
    return this.rpc('claim_seat', { p_room_code: roomCode.toUpperCase(), p_sticker: sticker });
  }

  setReady(gameId: string, ready: boolean): Promise<RoomBootstrap> {
    return this.rpc('set_ready', { p_game_id: gameId, p_ready: ready });
  }

  setTimerMode(gameId: string, timerSeconds: 8 | 15): Promise<RoomBootstrap> {
    return this.rpc('set_timer_mode', { p_game_id: gameId, p_timer_seconds: timerSeconds });
  }

  submitAnswer(gameId: string, windowId: string, optionId: string): Promise<RoomBootstrap> {
    return this.rpc('submit_answer', { p_game_id: gameId, p_window_id: windowId, p_option_id: optionId });
  }

  submitTraitFeedback(gameId: string, traitId: string, feedback: 'thats_me' | 'not_me'): Promise<RoomBootstrap> {
    return this.rpc('submit_trait_feedback', { p_game_id: gameId, p_trait_id: traitId, p_feedback: feedback });
  }

  acknowledgeRole(gameId: string): Promise<RoomBootstrap> {
    return this.rpc('acknowledge_role', { p_game_id: gameId });
  }

  claimObjection(gameId: string, windowId: string): Promise<RoomBootstrap> {
    return this.rpc('claim_objection', { p_game_id: gameId, p_window_id: windowId });
  }

  advanceIfDue(gameId: string, windowId: string): Promise<RoomBootstrap> {
    return this.rpc('advance_if_due', { p_game_id: gameId, p_window_id: windowId });
  }

  getPublicState(gameId: string): Promise<PublicGameSnapshot> {
    return this.rpc('get_public_game_state', { p_game_id: gameId });
  }

  getPlayerState(gameId: string): Promise<PlayerSelfSnapshot | null> {
    return this.rpc('get_player_self_state', { p_game_id: gameId });
  }

  getEventsAfter(gameId: string, afterSequence: number): Promise<PublicEvent[]> {
    return this.rpc('get_events_after', { p_game_id: gameId, p_after_sequence: afterSequence });
  }

  agentAction<T>(
    toolName: string,
    gameId: string,
    checkpointId: string,
    expectedRevision: number,
    payload: Record<string, Json>,
  ): Promise<ToolResult<T>> {
    return this.rpc('agent_action', {
      p_tool_name: toolName,
      p_game_id: gameId,
      p_checkpoint_id: checkpointId,
      p_expected_revision: expectedRevision,
      p_payload: payload,
    });
  }

  proposeQuestions(
    toolName: string,
    gameId: string,
    checkpointId: string,
    expectedRevision: number,
    questions: QuestionDraft[],
  ): Promise<ToolResult> {
    return this.agentAction(toolName, gameId, checkpointId, expectedRevision, { questions: questions as unknown as Json });
  }

  async refresh(gameId: string, viewerKind: 'host' | Seat | 'join'): Promise<{ publicState: PublicGameSnapshot; selfState: PlayerSelfSnapshot | null }> {
    const [publicState, selfState] = await Promise.all([
      this.getPublicState(gameId),
      viewerKind === 'host' || viewerKind === 'join' ? Promise.resolve(null) : this.getPlayerState(gameId),
    ]);
    return { publicState, selfState };
  }

  async subscribe(gameId: string, onInvalidate: () => void, onStatus: (status: string) => void): Promise<() => void> {
    await ensureAnonymousSession();
    const client = getSupabaseClient();
    let channel: RealtimeChannel | null = client.channel(`game:${gameId}`, { config: { private: true } });
    channel
      .on('broadcast', { event: 'game_changed' }, () => onInvalidate())
      .subscribe((status) => {
        onStatus(status);
        if (status === 'SUBSCRIBED') onInvalidate();
      });
    return () => {
      if (!channel) return;
      void client.removeChannel(channel);
      channel = null;
    };
  }

  async waitForPublicEvent(gameId: string, afterSequence: number, timeoutMs: number, signal?: AbortSignal): Promise<PublicEvent | null> {
    const cappedTimeout = Math.min(Math.max(timeoutMs, 0), 20_000);
    if (signal?.aborted) throw new DOMException('WebMCP execution was cancelled.', 'AbortError');
    const existing = await this.getEventsAfter(gameId, afterSequence);
    if (existing[0]) return existing[0];
    if (signal?.aborted) throw new DOMException('WebMCP execution was cancelled.', 'AbortError');

    return new Promise<PublicEvent | null>((resolve, reject) => {
      let settled = false;
      let cleanup = () => {};
      const finish = (value: PublicEvent | null, error?: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        cleanup();
        signal?.removeEventListener('abort', onAbort);
        if (error) reject(error); else resolve(value);
      };
      const read = async () => {
        try {
          const events = await this.getEventsAfter(gameId, afterSequence);
          if (events[0]) finish(events[0]);
        } catch (error) {
          finish(null, error);
        }
      };
      const onAbort = () => finish(null, new DOMException('WebMCP execution was cancelled.', 'AbortError'));
      const timer = setTimeout(() => finish(null), cappedTimeout);
      signal?.addEventListener('abort', onAbort, { once: true });
      void this.subscribe(gameId, () => void read(), () => {})
        .then(async (unsubscribe) => {
          if (settled) {
            unsubscribe();
            return;
          }
          cleanup = unsubscribe;
          await read();
        })
        .catch((error: unknown) => finish(null, error));
    });
  }
}

export const gameGateway = new GameGateway();
