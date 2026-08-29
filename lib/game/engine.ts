import {
  ABILITY_LABELS,
  CLUE_LABELS,
  ENDING_LABELS,
  getAffordances,
  ITEM_LABELS,
  LOCATION_LABELS,
} from './content';
import type {
  AbilityId,
  ActionInput,
  AdventureState,
  AttributeId,
  CanonicalEvent,
  EndingId,
  GameSession,
  ManuscriptEntry,
  ManuscriptInput,
  OperationRecord,
  ResultTier,
  RollResult,
  ToolFailure,
  ToolResponse,
  ToolSuccess,
  TurnResolution,
} from './types';

const MAX_LEDGER_RECORDS = 40;

type IdFactory = (prefix: string) => string;

export interface EngineContext {
  now: () => number;
  id: IdFactory;
}

export const defaultEngineContext: EngineContext = {
  now: () => Date.now(),
  id: (prefix) => `${prefix}_${crypto.randomUUID()}`,
};

export function createSession(
  name: string,
  specialty: AttributeId,
  context: EngineContext = defaultEngineContext,
): GameSession {
  const displayName = name.trim().slice(0, 40) || 'the traveler';
  const stats: Record<AttributeId, number> = { wits: 1, nerve: 1, grace: 1 };
  stats[specialty] = 2;
  const opening: ManuscriptEntry = {
    id: context.id('entry'),
    turn: 0,
    createdAt: context.now(),
    resolution: null,
    prose: `${displayName === 'the traveler' ? 'The traveler' : displayName} woke beside a dying hearth. A raven watched from the rafters while the chained door breathed cold air around its frame. Beneath the floor, something answered the clock.`,
  };

  return {
    schemaVersion: 1,
    sessionId: context.id('session'),
    revision: 1,
    phase: 'READY_FOR_ACTION',
    turn: 0,
    clock: 0,
    resolve: 3,
    character: { name: displayName, specialty },
    stats,
    locationId: 'main_hall',
    inventoryIds: ['lit_tin_lantern', 'half_burnt_letter'],
    clueIds: [],
    unlockedAbilityIds: [],
    usedAbilityIds: [],
    manuscript: [opening],
    pendingResolution: null,
    endingId: null,
    operationLedger: [],
  };
}

export function toAdventureState(session: GameSession): AdventureState {
  return {
    sessionId: session.sessionId,
    revision: session.revision,
    phase: session.phase,
    requiredNextTool:
      session.phase === 'AWAITING_MANUSCRIPT' ||
      session.phase === 'AWAITING_FINAL_MANUSCRIPT'
        ? 'write_manuscript_entry'
        : session.phase === 'COMPLETE'
          ? 'none'
          : 'perform_action_or_unlocked_ability',
    turn: session.turn,
    clock: session.clock,
    resolve: session.resolve,
    character: session.character,
    stats: session.stats,
    location: {
      id: session.locationId,
      label: LOCATION_LABELS[session.locationId],
    },
    inventory: session.inventoryIds.map((id) => ({
      id,
      label: ITEM_LABELS[id] ?? id,
    })),
    clues: session.clueIds.map((id) => ({ id, label: CLUE_LABELS[id] ?? id })),
    abilities: session.unlockedAbilityIds.map((id) => ({
      id,
      label: ABILITY_LABELS[id],
      used: session.usedAbilityIds.includes(id),
    })),
    affordances:
      session.phase === 'READY_FOR_ACTION' ? getAffordances(session) : [],
    pendingResolution: session.pendingResolution,
    ending: session.endingId
      ? { id: session.endingId, label: ENDING_LABELS[session.endingId] }
      : null,
    scenePrompt: scenePrompt(session),
  };
}

function scenePrompt(session: GameSession): string {
  if (session.phase === 'COMPLETE' && session.endingId)
    return `The manuscript is complete: ${ENDING_LABELS[session.endingId]}.`;
  if (session.pendingResolution)
    return 'A saved roll is waiting for its manuscript entry. Write it before taking another action.';
  if (
    session.clueIds.includes('first_name_fragment') &&
    session.clueIds.includes('second_name_fragment')
  )
    return 'The two fragments form VESPER. The breathing waits below the floor.';
  if (session.locationId === 'upstairs_room')
    return 'Rain scratches the upstairs window. The black mirror frame is empty except for one sharp fragment.';
  return 'The hearth fades, the raven watches, and the chained entrance moves in the draft.';
}

export function getStateResponse(session: GameSession | null): ToolResponse {
  if (!session)
    return failure(
      'NO_ACTIVE_SESSION',
      'Begin the story on the page before asking for adventure state.',
    );
  return { ok: true, state: toAdventureState(session) };
}

export function resolveAction(
  session: GameSession,
  input: ActionInput,
  die: number | (() => number),
  context: EngineContext = defaultEngineContext,
): { session: GameSession; response: ToolResponse } {
  const fingerprint = stableFingerprint('action', input);
  const duplicate = findOperation(session, input.operationId);
  if (duplicate) return replayOrReuseError(session, duplicate, fingerprint);
  if (
    !validOperationId(input.operationId) ||
    !Number.isInteger(input.expectedRevision) ||
    !isAttribute(input.approach) ||
    !input.targetId ||
    !input.intent.trim()
  ) {
    return unchanged(
      session,
      failure(
        'INVALID_INPUT',
        'Provide a unique operationId, the current revision, a listed targetId, an approach, and a short intent.',
        session,
      ),
    );
  }
  if (input.expectedRevision !== session.revision)
    return unchanged(
      session,
      failure(
        'STALE_STATE',
        `Expected revision ${input.expectedRevision}, but the saved game is revision ${session.revision}. Read state again.`,
        session,
      ),
    );
  if (session.pendingResolution)
    return unchanged(
      session,
      failure(
        'NARRATION_REQUIRED',
        'This roll is already saved. Write its manuscript entry before taking a new action.',
        session,
        session.pendingResolution,
      ),
    );
  if (session.phase !== 'READY_FOR_ACTION')
    return unchanged(
      session,
      failure(
        'ACTION_UNAVAILABLE',
        'The adventure is not accepting another action right now.',
        session,
      ),
    );

  const actionError = validateAction(session, input.targetId);
  if (actionError) return unchanged(session, actionError);

  const next = structuredClone(session);
  const resolutionId = context.id('resolution');
  const events: CanonicalEvent[] = [];
  const newAbilities: AbilityId[] = [];
  const dc = actionDc(input.targetId);
  const roll = makeRoll(
    typeof die === 'function' ? die() : die,
    input.approach,
    next.stats[input.approach],
    dc,
  );
  const costly =
    roll.tier === 'costly_success' ||
    roll.tier === 'setback' ||
    roll.tier === 'critical_setback';

  next.turn += 1;
  next.clock = Math.min(6, next.clock + 1);
  applyAction(next, input.targetId, roll, events, newAbilities, resolutionId);
  if (costly && !events.some((event) => event.type === 'resolve'))
    loseResolve(
      next,
      events,
      resolutionId,
      'The effort lets the darkness close in.',
    );

  let ending = next.endingId;
  if (input.targetId === 'speak_the_true_name') ending = 'true_name';
  else if (input.targetId === 'escape_front_door') ending = 'escape';
  else if (input.targetId === 'enter_cellar_unprepared') ending = 'new_keeper';
  else if (next.resolve <= 0 || next.clock >= 6) ending = 'new_keeper';

  if (ending) {
    next.endingId = ending;
    addEvent(
      events,
      resolutionId,
      'ending',
      ENDING_LABELS[ending],
      endingDetail(ending),
    );
  }

  const resolution: TurnResolution = {
    resolutionId,
    actionId: input.targetId,
    intent: input.intent.trim().slice(0, 280),
    turn: next.turn,
    createdAt: context.now(),
    roll,
    canonicalEvents: events,
    representedEventIds: events.map((event) => event.id),
    mustInclude: events.map((event) => event.detail),
    mustNotClaim: [
      'Do not invent additional items, clues, characters, exits, damage, or a different ending.',
      'Do not change the die, modifier, DC, result tier, clock, or Resolve.',
    ],
    newAbilityIds: newAbilities,
  };
  next.pendingResolution = resolution;
  next.phase = ending ? 'AWAITING_FINAL_MANUSCRIPT' : 'AWAITING_MANUSCRIPT';
  next.revision += 1;

  const response: ToolSuccess = {
    ok: true,
    state: toAdventureState(next),
    resolution,
  };
  recordOperation(next, {
    operationId: input.operationId,
    fingerprint,
    kind: 'action',
    result: response,
  });
  return { session: next, response };
}

export function writeManuscript(
  session: GameSession,
  input: ManuscriptInput,
  context: EngineContext = defaultEngineContext,
): { session: GameSession; response: ToolResponse } {
  const fingerprint = stableFingerprint('manuscript', input);
  const duplicate = findOperation(session, input.operationId);
  if (duplicate) return replayOrReuseError(session, duplicate, fingerprint);
  if (
    !validOperationId(input.operationId) ||
    !Number.isInteger(input.expectedRevision) ||
    !input.resolutionId ||
    !Array.isArray(input.representedEventIds)
  ) {
    return unchanged(
      session,
      failure(
        'INVALID_INPUT',
        'Provide a unique operationId, current revision, resolutionId, representedEventIds, and plain-text prose.',
        session,
      ),
    );
  }
  if (input.expectedRevision !== session.revision)
    return unchanged(
      session,
      failure(
        'STALE_STATE',
        `Expected revision ${input.expectedRevision}, but the saved game is revision ${session.revision}. Read state again.`,
        session,
      ),
    );
  const pending = session.pendingResolution;
  if (
    !pending ||
    (session.phase !== 'AWAITING_MANUSCRIPT' &&
      session.phase !== 'AWAITING_FINAL_MANUSCRIPT')
  )
    return unchanged(
      session,
      failure(
        'ACTION_UNAVAILABLE',
        'No saved turn is waiting for a manuscript entry.',
        session,
      ),
    );
  if (pending.resolutionId !== input.resolutionId)
    return unchanged(
      session,
      failure(
        'NARRATION_REQUIRED',
        `Write the exact saved resolution ${pending.resolutionId}.`,
        session,
        pending,
      ),
    );
  const missing = pending.representedEventIds.filter(
    (id) => !input.representedEventIds.includes(id),
  );
  const prose = plainProse(input.prose);
  if (missing.length > 0 || prose.length < 80 || prose.length > 700) {
    return unchanged(
      session,
      failure(
        'INVALID_INPUT',
        missing.length > 0
          ? `The manuscript must acknowledge every canonical event ID. Missing: ${missing.join(', ')}.`
          : 'Write one natural 35–60 word paragraph using plain text (80–700 characters accepted).',
        session,
        pending,
      ),
    );
  }

  const next = structuredClone(session);
  const entry: ManuscriptEntry = {
    id: context.id('entry'),
    turn: pending.turn,
    prose,
    createdAt: context.now(),
    resolution: pending,
  };
  next.manuscript.push(entry);
  next.pendingResolution = null;
  next.phase = next.endingId ? 'COMPLETE' : 'READY_FOR_ACTION';
  next.revision += 1;
  const response: ToolSuccess = {
    ok: true,
    state: toAdventureState(next),
    manuscriptEntry: entry,
  };
  recordOperation(next, {
    operationId: input.operationId,
    fingerprint,
    kind: 'manuscript',
    result: response,
  });
  return { session: next, response };
}

function validateAction(
  session: GameSession,
  actionId: string,
): ToolFailure | null {
  const listed = getAffordances(session).some(
    (action) => action.id === actionId,
  );
  if (listed) return null;
  if (
    actionId === 'reveal_hidden_ink' ||
    actionId === 'ask_the_raven' ||
    actionId === 'speak_the_true_name'
  ) {
    if (!session.unlockedAbilityIds.includes(actionId))
      return failure(
        'ABILITY_LOCKED',
        `${ABILITY_LABELS[actionId]} has not been unlocked. Follow the current affordances.`,
        session,
      );
    if (
      session.usedAbilityIds.includes(actionId) &&
      actionId !== 'speak_the_true_name'
    )
      return failure(
        'ACTION_UNAVAILABLE',
        `${ABILITY_LABELS[actionId]} has already been used.`,
        session,
      );
    return null;
  }
  return failure(
    'ACTION_UNAVAILABLE',
    `"${actionId}" is not available. Choose one of the returned affordance IDs; no roll occurred.`,
    session,
  );
}

function applyAction(
  session: GameSession,
  actionId: string,
  roll: RollResult,
  events: CanonicalEvent[],
  newAbilities: AbilityId[],
  resolutionId: string,
): void {
  switch (actionId) {
    case 'search_hearth':
      move(session, 'main_hall', events, resolutionId);
      addUnique(session.inventoryIds, 'charred_key');
      addEvent(
        events,
        resolutionId,
        'item',
        'Charred Key found',
        roll.total >= roll.dc
          ? 'A Charred Key waits beneath the loose hearthstone.'
          : "The key is found, but hot ash burns the traveler's hand.",
      );
      break;
    case 'search_upstairs_room':
      move(session, 'upstairs_room', events, resolutionId);
      addUnique(session.inventoryIds, 'black_mirror_shard');
      unlock(session, 'reveal_hidden_ink', events, newAbilities, resolutionId);
      addEvent(
        events,
        resolutionId,
        'item',
        'Black Mirror Shard found',
        roll.total >= roll.dc
          ? 'A Black Mirror Shard lies inside the empty frame.'
          : "The shard is recovered as the room's reflection moves a moment too late.",
      );
      break;
    case 'reveal_hidden_ink':
      markUsed(session, 'reveal_hidden_ink');
      addUnique(session.clueIds, 'first_name_fragment');
      addEvent(
        events,
        resolutionId,
        'clue',
        'First name fragment',
        'Hidden ink on the half-burnt letter reveals the first fragment: VES—.',
      );
      break;
    case 'offer_charred_key_to_raven':
      move(session, 'main_hall', events, resolutionId);
      remove(session.inventoryIds, 'charred_key');
      addUnique(session.clueIds, 'raven_trust');
      unlock(session, 'ask_the_raven', events, newAbilities, resolutionId);
      addEvent(
        events,
        resolutionId,
        'story',
        'The raven accepts the key',
        'The raven takes the Charred Key and chooses to trust the traveler.',
      );
      break;
    case 'ask_the_raven':
      markUsed(session, 'ask_the_raven');
      addUnique(session.clueIds, 'second_name_fragment');
      unlock(
        session,
        'speak_the_true_name',
        events,
        newAbilities,
        resolutionId,
      );
      addEvent(
        events,
        resolutionId,
        'clue',
        'Second name fragment',
        'The raven speaks the second fragment: —PER. Together the hidden name is VESPER.',
      );
      break;
    case 'speak_the_true_name':
      move(session, 'cellar', events, resolutionId);
      markUsed(session, 'speak_the_true_name');
      addEvent(
        events,
        resolutionId,
        'story',
        'The name is spoken',
        'In the cellar, the traveler speaks VESPER and the breathing beneath the tavern stops.',
      );
      break;
    case 'escape_front_door':
      move(session, 'main_hall', events, resolutionId);
      addEvent(
        events,
        resolutionId,
        'story',
        'The chain opens',
        'The Charred Key opens the chained entrance, and the traveler escapes before dawn.',
      );
      break;
    case 'enter_cellar_unprepared':
      move(session, 'cellar', events, resolutionId);
      addEvent(
        events,
        resolutionId,
        'story',
        'The cellar takes its due',
        "Without the complete True Name, the traveler descends and the old keeper's chair turns toward them.",
      );
      break;
    default:
      addEvent(
        events,
        resolutionId,
        'story',
        'The tavern answers',
        roll.total >= roll.dc
          ? 'The attempt reveals how closely the tavern is listening, but no new key or clue appears.'
          : 'The attempt changes nothing except the nearness of the sixth bell.',
      );
  }
}

function makeRoll(
  die: number,
  attribute: AttributeId,
  modifier: number,
  dc: number,
): RollResult {
  const bounded = Math.max(1, Math.min(20, Math.trunc(die)));
  const total = bounded + modifier;
  let tier: ResultTier;
  if (bounded === 20) tier = 'critical_success';
  else if (bounded === 1) tier = 'critical_setback';
  else if (total >= dc) tier = 'success';
  else if (total >= dc - 3) tier = 'costly_success';
  else tier = 'setback';
  return { die: bounded, attribute, modifier, total, dc, tier };
}

function actionDc(actionId: string): number {
  if (actionId === 'speak_the_true_name') return 11;
  if (actionId === 'ask_the_raven' || actionId === 'enter_cellar_unprepared')
    return 14;
  if (actionId === 'improvise') return 15;
  return 13;
}

function move(
  session: GameSession,
  locationId: GameSession['locationId'],
  events: CanonicalEvent[],
  resolutionId: string,
): void {
  if (session.locationId === locationId) return;
  session.locationId = locationId;
  addEvent(
    events,
    resolutionId,
    'location',
    `Moved to ${LOCATION_LABELS[locationId]}`,
    `The action carries the traveler to the ${LOCATION_LABELS[locationId]}.`,
  );
}

function unlock(
  session: GameSession,
  abilityId: AbilityId,
  events: CanonicalEvent[],
  newAbilities: AbilityId[],
  resolutionId: string,
): void {
  if (session.unlockedAbilityIds.includes(abilityId)) return;
  session.unlockedAbilityIds.push(abilityId);
  newAbilities.push(abilityId);
  addEvent(
    events,
    resolutionId,
    'ability',
    `${ABILITY_LABELS[abilityId]} unlocked`,
    `${ABILITY_LABELS[abilityId]} is now an available page ability for ChatGPT.`,
  );
}

function markUsed(session: GameSession, abilityId: AbilityId): void {
  addUnique(session.usedAbilityIds, abilityId);
}

function loseResolve(
  session: GameSession,
  events: CanonicalEvent[],
  resolutionId: string,
  detail: string,
): void {
  session.resolve = Math.max(0, session.resolve - 1);
  addEvent(
    events,
    resolutionId,
    'resolve',
    'Resolve lost',
    `${detail} Resolve falls to ${session.resolve}.`,
  );
}

function addEvent(
  events: CanonicalEvent[],
  resolutionId: string,
  type: CanonicalEvent['type'],
  label: string,
  detail: string,
): void {
  events.push({
    id: `${resolutionId}_event_${events.length + 1}`,
    type,
    label,
    detail,
  });
}

function endingDetail(ending: EndingId): string {
  if (ending === 'true_name')
    return 'The True Name breaks the cycle. Dawn enters the tavern for the first time in years.';
  if (ending === 'escape')
    return 'The traveler escapes, but the curse remains for whoever opens the tavern next.';
  return "The sixth bell claims the traveler as the tavern's new keeper.";
}

function recordOperation(session: GameSession, record: OperationRecord): void {
  session.operationLedger.push(record);
  if (session.operationLedger.length > MAX_LEDGER_RECORDS)
    session.operationLedger.splice(
      0,
      session.operationLedger.length - MAX_LEDGER_RECORDS,
    );
}

function findOperation(
  session: GameSession,
  operationId: string,
): OperationRecord | undefined {
  return session.operationLedger.find(
    (record) => record.operationId === operationId,
  );
}

function replayOrReuseError(
  session: GameSession,
  record: OperationRecord,
  fingerprint: string,
): { session: GameSession; response: ToolResponse } {
  if (record.fingerprint !== fingerprint)
    return unchanged(
      session,
      failure(
        'OPERATION_ID_REUSED',
        'This operationId was already used for a different request. Create a new unique ID.',
        session,
      ),
    );
  return {
    session,
    response: record.result.ok
      ? {
          ...record.result,
          state: toAdventureState(session),
          idempotentReplay: true,
        }
      : record.result,
  };
}

function stableFingerprint(kind: string, input: object): string {
  return `${kind}:${JSON.stringify(input, Object.keys(input).sort())}`;
}

function failure(
  code: ToolFailure['code'],
  message: string,
  session?: GameSession,
  pendingResolution?: TurnResolution,
): ToolFailure {
  return {
    ok: false,
    code,
    message,
    ...(session ? { state: toAdventureState(session) } : {}),
    ...(pendingResolution ? { pendingResolution } : {}),
  };
}

function unchanged(
  session: GameSession,
  response: ToolResponse,
): { session: GameSession; response: ToolResponse } {
  return { session, response };
}

function addUnique<T>(values: T[], value: T): void {
  if (!values.includes(value)) values.push(value);
}
function remove<T>(values: T[], value: T): void {
  const index = values.indexOf(value);
  if (index >= 0) values.splice(index, 1);
}
function isAttribute(value: string): value is AttributeId {
  return value === 'wits' || value === 'nerve' || value === 'grace';
}
function validOperationId(value: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9_-]{5,100}$/.test(value);
}
function plainProse(value: string): string {
  return value
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 700);
}
