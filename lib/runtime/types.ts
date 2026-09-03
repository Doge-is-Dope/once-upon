export type SessionPhase = 'READY' | 'AWAITING_CHAPTER' | 'COMPLETE';

export type DiscoveryId = string;
export type FactId = string;
export type InteractionId = string;

export interface StoryChapter {
  id: string;
  title: string;
  prose: string;
  /** Official record text; present only in `record` stories. */
  recordProse?: string;
  createdAt: number;
  turnId: string | null;
  discoveryIds: DiscoveryId[];
  effectReceiptId: string | null;
}

export interface DiscoveryRecord {
  id: DiscoveryId;
  chapterId: string;
  discoveredAt: number;
}

export interface WorldFact {
  id: FactId;
  value: string;
  revealedByInteractionId: InteractionId;
  revealedAt: number;
}

/**
 * Names how a frame presents an interaction's effect on the page. The
 * experience registry validates each id against the frame's manifest
 * (see lib/frames/book.ts), so a story cannot name an unsupported one.
 */
export type StoryPresentationId = string;

export interface InteractionEffectReceipt {
  receiptId: string;
  interactionId: InteractionId;
  presentation: StoryPresentationId;
  factIds: FactId[];
  facts: Array<{ id: FactId; value: string }>;
  createdAt: number;
}

export interface PendingTurn {
  turnId: string;
  kind: 'choice' | 'interaction';
  playerChoice: string;
  createdAt: number;
  interactionId: InteractionId | null;
  effectReceipt: InteractionEffectReceipt | null;
}

export interface InteractionUse {
  interactionId: InteractionId;
  status: 'pending' | 'retired';
  invokedAt: number;
  retiredAt: number | null;
  receiptId: string;
}

export interface OperationReplay {
  revision: number;
  turnId?: string;
  receipt?: InteractionEffectReceipt;
  chapterId?: string;
}

export interface OperationRecord {
  operationId: string;
  fingerprint: string;
  kind: 'begin_turn' | 'interaction' | 'chapter';
  replay: OperationReplay;
}

export interface ExperienceSession {
  experienceId: string;
  storyId: string;
  sessionId: string;
  revision: number;
  phase: SessionPhase;
  continuitySummary: string;
  chapters: StoryChapter[];
  discoveries: DiscoveryRecord[];
  facts: WorldFact[];
  interactionUses: InteractionUse[];
  pendingTurn: PendingTurn | null;
  operationLedger: OperationRecord[];
}

export interface StoryInteractionDefinition {
  id: InteractionId;
  toolName: string;
  title: string;
  description: string;
  cue: string;
  /**
   * Screen-reader line spoken when this interaction's effect lands on the
   * page. Falls back to the presentation's default when omitted.
   */
  announcement?: string;
  requiredDiscoveryIds: readonly DiscoveryId[];
  requiredInteractionIds: readonly InteractionId[];
  requiredFactIds: readonly FactId[];
  sealedFacts: ReadonlyArray<{
    id: FactId;
    value: string;
    /** Required in `record` stories, forbidden otherwise. */
    recordValue?: string;
    protectedTerms: readonly string[];
  }>;
  presentation: StoryPresentationId;
  completionPolicy: 'must_continue' | 'may_complete' | 'must_complete';
}

export interface DerivedInteractionSurface {
  interaction: StoryInteractionDefinition;
  prerequisitesMet: boolean;
  registered: boolean;
  callable: boolean;
  useStatus: 'unused' | InteractionUse['status'];
}

export interface StoryDiscoveryRequirement {
  id: DiscoveryId;
  requiredInteractionIds: readonly InteractionId[];
  requiredFactIds: readonly FactId[];
}

export type StoryClueReveal =
  | { kind: 'prologue' }
  | { kind: 'discovery'; id: DiscoveryId }
  | { kind: 'fact'; id: FactId };

export type StoryClueLeadTarget =
  | { kind: 'interaction'; id: InteractionId }
  | { kind: 'discovery'; id: DiscoveryId };

export interface StoryClueDefinition {
  id: string;
  title: string;
  observation: string;
  revealedBy: StoryClueReveal;
  lead?: {
    text: string;
    target: StoryClueLeadTarget;
  };
}

/**
 * `prose` stories carry one player-facing text. `record` stories also keep
 * an official third-person record of every passage: the agent must submit
 * `recordProse` with each chapter, the restricted sheet censors its lines,
 * and the fixed ending rewrites itself into the record after typing.
 */
export type StoryNarration = 'prose' | 'record';

export interface StoryDefinition {
  id: string;
  narration: StoryNarration;
  prologue: {
    title: string;
    prose: string;
    /** Required in `record` stories, forbidden otherwise. */
    recordProse?: string;
    continuitySummary: string;
  };
  clues: readonly StoryClueDefinition[];
  completionPassage: { prose: string; recordProse?: string };
  discoveryIds: readonly DiscoveryId[];
  discoveryRequirements: readonly StoryDiscoveryRequirement[];
  completionRequiredFactIds: readonly FactId[];
  interactions: readonly StoryInteractionDefinition[];
}

/**
 * Player-facing wording the book frame renders around the manuscript. The
 * frame ships neutral defaults; a story overrides only the lines it wants
 * in its own voice.
 */
export interface BookFrameCopy {
  /** Running head printed above every sheet. */
  runningHead: string;
  /** Prompt above the player's next move, by story stage and agent state. */
  turnPrompt: {
    opening: string;
    next: string;
    openingWaiting: string;
    nextWaiting: string;
  };
  /** Character action appended to the resume message copied for the agent. */
  resumeMove: string;
  /** Hint shown when no story object is currently available. */
  hint: { opening: string; continuing: string };
  /** Clue notebook labels. */
  notes: { eyebrow: string; title: string; footnote: string };
  /** Shared, read-only copy page. */
  shared: { returnLabel: string };
}

export interface BookFrameCopyOverrides {
  runningHead?: string;
  turnPrompt?: Partial<BookFrameCopy['turnPrompt']>;
  resumeMove?: string;
  hint?: Partial<BookFrameCopy['hint']>;
  notes?: Partial<BookFrameCopy['notes']>;
  shared?: Partial<BookFrameCopy['shared']>;
}

export interface FrameDefinition {
  id: 'book';
  copy?: BookFrameCopyOverrides;
}

export interface AgentContract {
  version: string;
  instructions: string;
}

export interface ExperienceDefinition {
  id: string;
  title: string;
  story: StoryDefinition;
  frame: FrameDefinition;
  startMessage: string;
  agentContract: AgentContract;
}

export interface AvailableInteraction {
  id: InteractionId;
  toolName: string;
  title: string;
  cue: string;
}

export interface StoryStateSnapshot {
  experienceId: string;
  storyId: string;
  sessionId: string;
  revision: number;
  phase: SessionPhase;
  bootstrap: {
    protocolVersion: 'living-manuscript-v2';
    contractVersion: string;
    instructions: string;
    mode: 'opening' | 'continuing' | 'recovering' | 'complete';
  };
  requiredNextTool: 'commit_story_chapter' | 'none';
  requiredChapterStatus: 'none' | 'continue' | 'complete' | 'either';
  allowedNextTools: string[];
  continuitySummary: string;
  latestChapter: { title: string; excerpt: string };
  pending: null | {
    turnId: string;
    kind: PendingTurn['kind'];
    playerChoice: string;
    interactionId: InteractionId | null;
    effectReceipt: InteractionEffectReceipt | null;
  };
  availableInteractions: AvailableInteraction[];
}

export interface ToolSuccess {
  ok: true;
  state: StoryStateSnapshot;
  turnId?: string;
  chapter?: StoryChapter;
  effectReceipt?: InteractionEffectReceipt;
  idempotentReplay?: boolean;
}

export interface ToolFailure {
  ok: false;
  code:
    | 'STALE_SESSION'
    | 'STALE_STATE'
    | 'CHAPTER_REQUIRED'
    | 'INTERACTION_LOCKED'
    | 'INTERACTION_USED'
    | 'ACTION_UNAVAILABLE'
    | 'INVALID_INPUT'
    | 'INVALID_DISCOVERY'
    | 'SEALED_FACT_LEAK'
    | 'OPERATION_ID_REUSED';
  message: string;
  state?: StoryStateSnapshot;
}

export type ToolResponse = ToolSuccess | ToolFailure;

export interface BeginStoryTurnInput {
  operationId: string;
  expectedSessionId: string;
  expectedRevision: number;
  playerChoice: string;
}

export interface InvokeInteractionInput extends BeginStoryTurnInput {
  interactionId: InteractionId;
}

export interface CommitStoryChapterInput {
  operationId: string;
  expectedSessionId: string;
  expectedRevision: number;
  turnId: string;
  title: string;
  prose: string;
  /** Required in `record` stories, rejected otherwise. */
  recordProse?: string;
  continuitySummary: string;
  discoveryIds: DiscoveryId[];
  status: 'continue' | 'complete';
  effectReceiptId?: string;
  representedFactIds?: FactId[];
}

export interface EngineContext {
  now: () => number;
  id: (prefix: string) => string;
}
