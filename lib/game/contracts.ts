export const STICKERS = ['tiger', 'frog', 'ghost', 'toast', 'moon', 'cherry'] as const;
export type Sticker = (typeof STICKERS)[number];
export type Seat = 'seat_a' | 'seat_b';
export type ViewerKind = 'host' | Seat | 'join';
export type GameMode = 'standard' | 'demo';

export type GamePhase =
  | 'lobby'
  | 'learn'
  | 'trait_review'
  | 'role_reveal'
  | 'challenge'
  | 'objection'
  | 'accuse'
  | 'revealed';

export type AgentCheckpointKind =
  | 'awaiting_learn_questions'
  | 'awaiting_contrast_question'
  | 'awaiting_traits'
  | 'awaiting_challenge_question'
  | 'awaiting_suspicion'
  | 'awaiting_objection_question'
  | 'awaiting_objection_resolution'
  | 'awaiting_accusation';

export type QuestionKind = 'learn' | 'contrast' | 'challenge' | 'objection';
export type PrivateRole = 'original' | 'mirror';

export interface PublicPlayer {
  seat: Seat;
  sticker: Sticker | null;
  ready: boolean;
  answered: boolean;
  traits: Array<{ id: string; text: string; feedback: 'thats_me' | 'not_me' | null }>;
}

export interface PublicOption {
  id: string;
  label: string;
}

export interface PublicQuestion {
  id: string;
  kind: QuestionKind;
  ordinal: number;
  prompt: string;
  options?: PublicOption[];
  revealedAnswers?: Partial<Record<Seat, { optionId: string | null; label: string }>>;
}

export interface PublicSuspicion {
  id: string;
  round: number;
  targetSeat: Seat;
  reason: string;
  evidenceIds: number[];
  resolution?: 'keep' | 'switch';
}

export interface PublicEvent {
  id: number;
  sequence: number;
  type: string;
  actor: 'system' | 'host' | Seat | 'detective';
  summary: string;
  payload?: Record<string, unknown>;
  createdAt: string;
}

export interface QuestionRequest {
  kind: 'learn_batch' | 'contrast' | 'challenge' | 'objection';
  count: number;
  optionCount: 3 | 4;
  round?: number;
  targetSeat?: Seat;
  limits: { promptMin: 8; promptMax: 120; optionMin: 1; optionMax: 48 };
}

export interface PublicGameSnapshot {
  gameId: string;
  roomCode: string;
  mode: GameMode;
  phase: GamePhase;
  checkpoint: { id: string; kind: AgentCheckpointKind } | null;
  revision: number;
  sequence: number;
  round: number;
  timerSeconds: 8 | 15;
  serverNowMs: number;
  deadlineMs: number | null;
  activeWindowId: string | null;
  revealAtMs: number | null;
  players: [PublicPlayer, PublicPlayer];
  currentQuestion: PublicQuestion | null;
  suspicion: PublicSuspicion | null;
  objection: { available: boolean; claimedBy: Seat | null; pendingTarget: Seat | null };
  accusation: { targetSeat: Seat; evidenceIds: number[] } | null;
  result: { originalSeat: Seat; mirrorSeat: Seat; winner: 'humans' | 'detective' } | null;
  timeline: PublicEvent[];
  eligibleEvidence: PublicEvent[];
  eligibleAgentActions: string[];
  questionRequest: QuestionRequest | null;
}

export interface PlayerSelfSnapshot {
  seat: Seat;
  role: PrivateRole | null;
  options: PublicOption[];
  canAnswer: boolean;
  selectedOptionId: string | null;
  canClaimObjection: boolean;
  traitFeedbackRequiredIds: string[];
  roleAcknowledged: boolean;
}

export interface RoomBootstrap {
  viewerKind: ViewerKind;
  publicState: PublicGameSnapshot;
  selfState: PlayerSelfSnapshot | null;
}

export interface QuestionDraft {
  prompt: string;
  options: string[];
  basisEvidenceIds?: number[];
}

export type ToolErrorCode =
  | 'REVISION_CONFLICT'
  | 'CHECKPOINT_EXPIRED'
  | 'INVALID_PHASE'
  | 'INVALID_EVIDENCE'
  | 'INVALID_QUESTION'
  | 'IDEMPOTENCY_CONFLICT'
  | 'ALREADY_COMPLETED'
  | 'NOT_AUTHORIZED';

export type ToolResult<T = Record<string, unknown>> =
  | { ok: true; revision: number; sequence: number; phase: GamePhase; data: T }
  | {
      ok: false;
      code: ToolErrorCode;
      revision: number;
      sequence: number;
      retry: 'refresh' | 'revise' | 'none';
      issues?: Array<{ path: string; code: string; message: string }>;
    };

export interface ConnectionState {
  status: 'connecting' | 'connected' | 'reconnecting' | 'offline';
  message?: string;
}

export interface RoomState {
  bootstrap: RoomBootstrap | null;
  connection: ConnectionState;
  pendingAction: string | null;
  error: string | null;
}

export type RoomAction =
  | { type: 'bootstrapped'; payload: RoomBootstrap }
  | { type: 'snapshot'; payload: { publicState: PublicGameSnapshot; selfState?: PlayerSelfSnapshot | null } }
  | { type: 'connection'; payload: ConnectionState }
  | { type: 'pending'; payload: string | null }
  | { type: 'error'; payload: string | null };

export const STICKER_META: Record<Sticker, { emoji: string; label: string }> = {
  tiger: { emoji: '🐯', label: 'Tiger' },
  frog: { emoji: '🐸', label: 'Frog' },
  ghost: { emoji: '👻', label: 'Ghost' },
  toast: { emoji: '🍞', label: 'Toast' },
  moon: { emoji: '🌙', label: 'Moon' },
  cherry: { emoji: '🍒', label: 'Cherry' },
};
