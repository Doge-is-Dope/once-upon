import type {
  ActionInput,
  EngineContext,
  ExperienceDefinition,
  ExperienceSession,
  NarrationEntry,
  NarrationInput,
  OperationRecord,
  ResultTier,
  RollResult,
  StoryStateSnapshot,
  ToolFailure,
  ToolResponse,
  ToolSuccess,
  TurnResolution,
} from './types';

const MAX_LEDGER_RECORDS = 40;

export const defaultEngineContext: EngineContext = {
  now: () => Date.now(),
  id: (prefix) => `${prefix}_${crypto.randomUUID()}`,
};

export function createExperienceSession(
  definition: ExperienceDefinition,
  name: string,
  specialty: string,
  context: EngineContext = defaultEngineContext,
): ExperienceSession {
  const initial = definition.story.createInitialState(name, specialty, context);
  const openingPayload = definition.narration.normalize(initial.opening);
  if (!openingPayload)
    throw new Error(
      `Experience ${definition.id} produced an opening that does not match its narration contract.`,
    );
  const opening: NarrationEntry = {
    id: context.id('entry'),
    turn: 0,
    createdAt: context.now(),
    resolution: null,
    payload: openingPayload,
  };

  return {
    schemaVersion: 2,
    experienceId: definition.id,
    storyId: definition.story.id,
    sessionId: context.id('session'),
    revision: 1,
    phase: 'READY_FOR_ACTION',
    turn: 0,
    clock: initial.clock,
    resolve: initial.resolve,
    character: initial.character,
    stats: initial.stats,
    locationId: initial.locationId,
    inventoryIds: initial.inventoryIds,
    clueIds: initial.clueIds,
    unlockedAbilityIds: initial.unlockedAbilityIds,
    usedAbilityIds: initial.usedAbilityIds,
    narrationEntries: [opening],
    pendingResolution: null,
    endingId: null,
    operationLedger: [],
  };
}

export function toStoryState(
  definition: ExperienceDefinition,
  session: ExperienceSession,
): StoryStateSnapshot {
  return {
    experienceId: session.experienceId,
    storyId: session.storyId,
    sessionId: session.sessionId,
    revision: session.revision,
    phase: session.phase,
    requiredNextTool:
      session.phase === 'AWAITING_NARRATION' ||
      session.phase === 'AWAITING_FINAL_NARRATION'
        ? 'commit_narration'
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
      label: definition.story.locationLabel(session.locationId),
    },
    inventory: session.inventoryIds.map((id) => ({
      id,
      label: definition.story.itemLabel(id),
    })),
    clues: session.clueIds.map((id) => ({
      id,
      label: definition.story.clueLabel(id),
    })),
    abilities: session.unlockedAbilityIds.map((id) => ({
      id,
      label: definition.story.abilityLabel(id),
      used: session.usedAbilityIds.includes(id),
    })),
    affordances:
      session.phase === 'READY_FOR_ACTION'
        ? definition.story.getAffordances(session)
        : [],
    pendingResolution: session.pendingResolution,
    ending: session.endingId
      ? {
          id: session.endingId,
          label: definition.story.endingLabel(session.endingId),
        }
      : null,
    scenePrompt: definition.story.scenePrompt(session),
  };
}

export function getStateResponse(
  definition: ExperienceDefinition,
  session: ExperienceSession | null,
): ToolResponse {
  if (!session)
    return failure(
      definition,
      'NO_ACTIVE_SESSION',
      'Begin the experience before asking for its story state.',
    );
  return { ok: true, state: toStoryState(definition, session) };
}

export function resolveAction(
  definition: ExperienceDefinition,
  session: ExperienceSession,
  input: ActionInput,
  die: number | (() => number),
  context: EngineContext = defaultEngineContext,
): { session: ExperienceSession; response: ToolResponse } {
  const fingerprint = stableFingerprint('action', input);
  const duplicate = findOperation(session, input.operationId);
  if (duplicate)
    return replayOrReuseError(definition, session, duplicate, fingerprint);
  if (
    !validOperationId(input.operationId) ||
    !Number.isInteger(input.expectedRevision) ||
    !definition.story.isAttribute(input.approach) ||
    !input.targetId ||
    !input.intent.trim()
  ) {
    return unchanged(
      session,
      failure(
        definition,
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
        definition,
        'STALE_STATE',
        `Expected revision ${input.expectedRevision}, but the saved story is revision ${session.revision}. Read state again.`,
        session,
      ),
    );
  if (session.pendingResolution)
    return unchanged(
      session,
      failure(
        definition,
        'NARRATION_REQUIRED',
        'This result is already saved. Commit its narration before taking a new action.',
        session,
        session.pendingResolution,
      ),
    );
  if (session.phase !== 'READY_FOR_ACTION')
    return unchanged(
      session,
      failure(
        definition,
        'ACTION_UNAVAILABLE',
        'The story is not accepting another action right now.',
        session,
      ),
    );

  const actionError = definition.story.validateAction(session, input.targetId);
  if (actionError)
    return unchanged(
      session,
      failure(definition, actionError.code, actionError.message, session),
    );

  const next = structuredClone(session);
  const resolutionId = context.id('resolution');
  const dc = definition.story.actionDc(input.targetId);
  const roll = makeRoll(
    typeof die === 'function' ? die() : die,
    input.approach,
    next.stats[input.approach] ?? 0,
    dc,
  );

  next.turn += 1;
  const storyResult = definition.story.applyAction(
    next,
    input.targetId,
    roll,
    resolutionId,
  );
  next.endingId = storyResult.endingId;

  const resolution: TurnResolution = {
    resolutionId,
    actionId: input.targetId,
    intent: input.intent.trim().slice(0, 280),
    turn: next.turn,
    createdAt: context.now(),
    roll,
    canonicalEvents: storyResult.canonicalEvents,
    representedEventIds: storyResult.canonicalEvents.map((event) => event.id),
    mustInclude: storyResult.canonicalEvents.map((event) => event.detail),
    mustNotClaim: storyResult.mustNotClaim ?? [
      'Do not invent additional items, clues, characters, exits, damage, or a different ending.',
      'Do not change the die, modifier, DC, result tier, clock, Resolve, or saved state.',
    ],
    newAbilityIds: storyResult.newAbilityIds,
  };
  next.pendingResolution = resolution;
  next.phase = next.endingId
    ? 'AWAITING_FINAL_NARRATION'
    : 'AWAITING_NARRATION';
  next.revision += 1;

  const response: ToolSuccess = {
    ok: true,
    state: toStoryState(definition, next),
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

export function commitNarration(
  definition: ExperienceDefinition,
  session: ExperienceSession,
  input: NarrationInput,
  context: EngineContext = defaultEngineContext,
): { session: ExperienceSession; response: ToolResponse } {
  const fingerprint = stableFingerprint('narration', input);
  const duplicate = findOperation(session, input.operationId);
  if (duplicate)
    return replayOrReuseError(definition, session, duplicate, fingerprint);
  if (
    !validOperationId(input.operationId) ||
    !Number.isInteger(input.expectedRevision) ||
    !input.resolutionId ||
    !Array.isArray(input.representedEventIds)
  ) {
    return unchanged(
      session,
      failure(
        definition,
        'INVALID_INPUT',
        'Provide a unique operationId, current revision, resolutionId, representedEventIds, and a valid narration payload.',
        session,
      ),
    );
  }
  if (input.expectedRevision !== session.revision)
    return unchanged(
      session,
      failure(
        definition,
        'STALE_STATE',
        `Expected revision ${input.expectedRevision}, but the saved story is revision ${session.revision}. Read state again.`,
        session,
      ),
    );
  const pending = session.pendingResolution;
  if (
    !pending ||
    (session.phase !== 'AWAITING_NARRATION' &&
      session.phase !== 'AWAITING_FINAL_NARRATION')
  )
    return unchanged(
      session,
      failure(
        definition,
        'ACTION_UNAVAILABLE',
        'No saved turn is waiting for narration.',
        session,
      ),
    );
  if (pending.resolutionId !== input.resolutionId)
    return unchanged(
      session,
      failure(
        definition,
        'NARRATION_REQUIRED',
        `Commit narration for the exact saved resolution ${pending.resolutionId}.`,
        session,
        pending,
      ),
    );

  const missing = pending.representedEventIds.filter(
    (id) => !input.representedEventIds.includes(id),
  );
  const payload = definition.narration.normalize(input.payload);
  if (missing.length > 0 || !payload) {
    return unchanged(
      session,
      failure(
        definition,
        'INVALID_INPUT',
        missing.length > 0
          ? `The narration must acknowledge every canonical event ID. Missing: ${missing.join(', ')}.`
          : definition.narration.instruction,
        session,
        pending,
      ),
    );
  }

  const next = structuredClone(session);
  const entry: NarrationEntry = {
    id: context.id('entry'),
    turn: pending.turn,
    payload,
    createdAt: context.now(),
    resolution: pending,
  };
  next.narrationEntries.push(entry);
  next.pendingResolution = null;
  next.phase = next.endingId ? 'COMPLETE' : 'READY_FOR_ACTION';
  next.revision += 1;
  const response: ToolSuccess = {
    ok: true,
    state: toStoryState(definition, next),
    narrationEntry: entry,
  };
  recordOperation(next, {
    operationId: input.operationId,
    fingerprint,
    kind: 'narration',
    result: response,
  });
  return { session: next, response };
}

function makeRoll(
  die: number,
  attribute: string,
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

function recordOperation(
  session: ExperienceSession,
  record: OperationRecord,
): void {
  session.operationLedger.push(record);
  if (session.operationLedger.length > MAX_LEDGER_RECORDS)
    session.operationLedger.splice(
      0,
      session.operationLedger.length - MAX_LEDGER_RECORDS,
    );
}

function findOperation(
  session: ExperienceSession,
  operationId: string,
): OperationRecord | undefined {
  return session.operationLedger.find(
    (record) => record.operationId === operationId,
  );
}

function replayOrReuseError(
  definition: ExperienceDefinition,
  session: ExperienceSession,
  record: OperationRecord,
  fingerprint: string,
): { session: ExperienceSession; response: ToolResponse } {
  if (record.fingerprint !== fingerprint)
    return unchanged(
      session,
      failure(
        definition,
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
          state: toStoryState(definition, session),
          idempotentReplay: true,
        }
      : record.result,
  };
}

function stableFingerprint(kind: string, input: object): string {
  return `${kind}:${stableStringify(input)}`;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
}

function failure(
  definition: ExperienceDefinition,
  code: ToolFailure['code'],
  message: string,
  session?: ExperienceSession,
  pendingResolution?: TurnResolution,
): ToolFailure {
  return {
    ok: false,
    code,
    message,
    ...(session ? { state: toStoryState(definition, session) } : {}),
    ...(pendingResolution ? { pendingResolution } : {}),
  };
}

function unchanged(
  session: ExperienceSession,
  response: ToolResponse,
): { session: ExperienceSession; response: ToolResponse } {
  return { session, response };
}

function validOperationId(value: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9_-]{5,100}$/.test(value);
}
