export type GamePhase =
  | 'SETUP'
  | 'READY_FOR_ACTION'
  | 'AWAITING_MANUSCRIPT'
  | 'AWAITING_FINAL_MANUSCRIPT'
  | 'COMPLETE';

export type AttributeId = 'wits' | 'nerve' | 'grace';
export type LocationId = 'main_hall' | 'upstairs_room' | 'cellar';
export type EndingId = 'escape' | 'new_keeper' | 'true_name';
export type AbilityId =
  | 'reveal_hidden_ink'
  | 'ask_the_raven'
  | 'speak_the_true_name';
export type ResultTier =
  | 'critical_success'
  | 'success'
  | 'costly_success'
  | 'setback'
  | 'critical_setback';

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

export interface ManuscriptEntry {
  id: string;
  turn: number;
  prose: string;
  createdAt: number;
  resolution: TurnResolution | null;
}

export interface OperationRecord {
  operationId: string;
  fingerprint: string;
  kind: 'action' | 'manuscript';
  result: ToolResponse;
}

export interface GameSession {
  schemaVersion: 1;
  sessionId: string;
  revision: number;
  phase: GamePhase;
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
  manuscript: ManuscriptEntry[];
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

export interface AdventureState {
  sessionId: string;
  revision: number;
  phase: GamePhase;
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
  state: AdventureState;
  resolution?: TurnResolution;
  manuscriptEntry?: ManuscriptEntry;
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
  state?: AdventureState;
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

export interface ManuscriptInput {
  operationId: string;
  expectedRevision: number;
  resolutionId: string;
  representedEventIds: string[];
  prose: string;
}
