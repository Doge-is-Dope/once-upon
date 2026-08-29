export type SessionPhase =
  | 'SETUP'
  | 'READY_FOR_ACTION'
  | 'AWAITING_NARRATION'
  | 'AWAITING_FINAL_NARRATION'
  | 'COMPLETE';

export type AttributeId = string;
export type AbilityId = string;
export type LocationId = string;
export type EndingId = string;

export type ResultTier =
  | 'critical_success'
  | 'success'
  | 'costly_success'
  | 'setback'
  | 'critical_setback';

export type NarrationPayload =
  | { format: 'prose'; text: string }
  | {
      format: 'terminal';
      lines: Array<{
        kind: 'command' | 'output' | 'system';
        text: string;
      }>;
    };

export type NarrationFormat = NarrationPayload['format'];

export interface Character {
  name: string;
  specialty: AttributeId;
}

export interface RollResult {
  die: number;
  attribute: AttributeId;
  modifier: number;
  total: number;
  dc: number;
  tier: ResultTier;
}

export interface CanonicalEvent {
  id: string;
  type:
    | 'location'
    | 'item'
    | 'clue'
    | 'ability'
    | 'resolve'
    | 'story'
    | 'ending';
  label: string;
  detail: string;
}

export interface TurnResolution {
  resolutionId: string;
  actionId: string;
  intent: string;
  turn: number;
  createdAt: number;
  roll: RollResult;
  canonicalEvents: CanonicalEvent[];
  representedEventIds: string[];
  mustInclude: string[];
  mustNotClaim: string[];
  newAbilityIds: AbilityId[];
}

export interface NarrationEntry {
  id: string;
  turn: number;
  payload: NarrationPayload;
  createdAt: number;
  resolution: TurnResolution | null;
}

export interface OperationRecord {
  operationId: string;
  fingerprint: string;
  kind: 'action' | 'narration';
  result: ToolResponse;
}

export interface ExperienceSession {
  schemaVersion: 2;
  experienceId: string;
  storyId: string;
  sessionId: string;
  revision: number;
  phase: SessionPhase;
  turn: number;
  clock: number;
  resolve: number;
  character: Character;
  stats: Record<AttributeId, number>;
  locationId: LocationId;
  inventoryIds: string[];
  clueIds: string[];
  unlockedAbilityIds: AbilityId[];
  usedAbilityIds: AbilityId[];
  narrationEntries: NarrationEntry[];
  pendingResolution: TurnResolution | null;
  endingId: EndingId | null;
  operationLedger: OperationRecord[];
}

export interface Affordance {
  id: string;
  label: string;
  description: string;
  suggestedApproaches: AttributeId[];
}

export interface StoryStateSnapshot {
  experienceId: string;
  storyId: string;
  sessionId: string;
  revision: number;
  phase: SessionPhase;
  requiredNextTool: string;
  turn: number;
  clock: number;
  resolve: number;
  character: Character;
  stats: Record<AttributeId, number>;
  location: { id: LocationId; label: string };
  inventory: Array<{ id: string; label: string }>;
  clues: Array<{ id: string; label: string }>;
  abilities: Array<{ id: AbilityId; label: string; used: boolean }>;
  affordances: Affordance[];
  pendingResolution: TurnResolution | null;
  ending: { id: EndingId; label: string } | null;
  scenePrompt: string;
}

export interface ToolSuccess {
  ok: true;
  state: StoryStateSnapshot;
  resolution?: TurnResolution;
  narrationEntry?: NarrationEntry;
  idempotentReplay?: boolean;
}

export interface ToolFailure {
  ok: false;
  code:
    | 'NO_ACTIVE_SESSION'
    | 'STALE_STATE'
    | 'NARRATION_REQUIRED'
    | 'ABILITY_LOCKED'
    | 'ACTION_UNAVAILABLE'
    | 'INVALID_INPUT'
    | 'OPERATION_ID_REUSED'
    | 'SAVE_CORRUPT';
  message: string;
  state?: StoryStateSnapshot;
  pendingResolution?: TurnResolution;
}

export type ToolResponse = ToolSuccess | ToolFailure;

export interface ActionInput {
  operationId: string;
  expectedRevision: number;
  targetId: string;
  approach: AttributeId;
  intent: string;
}

export interface NarrationInput {
  operationId: string;
  expectedRevision: number;
  resolutionId: string;
  representedEventIds: string[];
  payload: NarrationPayload;
}

export interface EngineContext {
  now: () => number;
  id: (prefix: string) => string;
}

export interface StoryInitialState {
  clock: number;
  resolve: number;
  character: Character;
  stats: Record<AttributeId, number>;
  locationId: LocationId;
  inventoryIds: string[];
  clueIds: string[];
  unlockedAbilityIds: AbilityId[];
  usedAbilityIds: AbilityId[];
  opening: NarrationPayload;
}

export interface StoryActionResult {
  canonicalEvents: CanonicalEvent[];
  newAbilityIds: AbilityId[];
  endingId: EndingId | null;
  mustNotClaim?: string[];
}

export interface StoryDefinition {
  id: string;
  attributeIds: AttributeId[];
  createInitialState(
    name: string,
    specialty: AttributeId,
    context: EngineContext,
  ): StoryInitialState;
  isAttribute(value: string): boolean;
  getAffordances(session: ExperienceSession): Affordance[];
  scenePrompt(session: ExperienceSession): string;
  locationLabel(id: LocationId): string;
  itemLabel(id: string): string;
  clueLabel(id: string): string;
  abilityLabel(id: AbilityId): string;
  abilityDescription(id: AbilityId): string;
  endingLabel(id: EndingId): string;
  actionDc(actionId: string): number;
  validateAction(
    session: ExperienceSession,
    actionId: string,
  ): { code: ToolFailure['code']; message: string } | null;
  applyAction(
    session: ExperienceSession,
    actionId: string,
    roll: RollResult,
    resolutionId: string,
  ): StoryActionResult;
}

export interface NarrationContract {
  format: NarrationFormat;
  inputSchema: Record<string, unknown>;
  normalize(payload: NarrationPayload): NarrationPayload | null;
  instruction: string;
}

export interface FrameDefinition {
  id: string;
  narrationFormat: NarrationFormat;
}

export interface ExperienceDefinition {
  id: string;
  title: string;
  story: StoryDefinition;
  frame: FrameDefinition;
  narration: NarrationContract;
  startMessage: string;
  continueMessage: string;
}
