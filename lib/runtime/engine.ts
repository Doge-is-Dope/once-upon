import type {
  AvailableInteraction,
  BeginStoryTurnInput,
  CommitStoryChapterInput,
  DerivedInteractionSurface,
  EngineContext,
  ExperienceDefinition,
  ExperienceSession,
  InteractionEffectReceipt,
  InvokeInteractionInput,
  OperationRecord,
  StoryChapter,
  StoryInteractionDefinition,
  StoryStateSnapshot,
  ToolFailure,
  ToolResponse,
  ToolSuccess,
} from './types';
import {
  hasSecondPersonPronoun,
  splitParagraphBlocks,
} from '../manuscript/prose';
import {
  CORE_TOOL_NAMES,
  LIVING_MANUSCRIPT_PROTOCOL_VERSION,
  RUNTIME_LIMITS,
} from './protocol';
const SNAPSHOT_SUMMARY_LENGTH = 520;
const SNAPSHOT_EXCERPT_LENGTH = 280;
const SNAPSHOT_CHOICE_LENGTH = 280;

type MutationEnvelopeInput = {
  operationId: string;
  expectedSessionId: string;
  expectedRevision: number;
};

type EngineOutcome = {
  session: ExperienceSession;
  response: ToolResponse;
};

type MutationPreflight = {
  fingerprint: string;
  outcome: EngineOutcome | null;
};

export const defaultEngineContext: EngineContext = {
  now: () => Date.now(),
  id: (prefix) => `${prefix}_${crypto.randomUUID()}`,
};

export function createExperienceSession(
  definition: ExperienceDefinition,
  context: EngineContext = defaultEngineContext,
): ExperienceSession {
  const chapter: StoryChapter = {
    id: context.id('chapter'),
    title: definition.story.prologue.title,
    prose: definition.story.prologue.prose,
    ...(definition.story.narration === 'record'
      ? { recordProse: definition.story.prologue.recordProse }
      : {}),
    createdAt: context.now(),
    turnId: null,
    discoveryIds: [],
    effectReceiptId: null,
  };
  return {
    experienceId: definition.id,
    storyId: definition.story.id,
    sessionId: context.id('session'),
    revision: 1,
    phase: 'READY',
    continuitySummary: definition.story.prologue.continuitySummary,
    chapters: [chapter],
    discoveries: [],
    facts: [],
    interactionUses: [],
    pendingTurn: null,
    operationLedger: [],
  };
}

export function availableInteractions(
  definition: ExperienceDefinition,
  session: ExperienceSession,
): StoryInteractionDefinition[] {
  return deriveInteractionSurface(definition, session)
    .filter(({ callable }) => callable)
    .map(({ interaction }) => interaction);
}

export function deriveInteractionSurface(
  definition: ExperienceDefinition,
  session: ExperienceSession,
): DerivedInteractionSurface[] {
  const discoveries = new Set(session.discoveries.map(({ id }) => id));
  const facts = new Set(session.facts.map(({ id }) => id));
  const completed = new Set(
    session.interactionUses
      .filter(({ status }) => status === 'retired')
      .map(({ interactionId }) => interactionId),
  );
  return definition.story.interactions.map((interaction) => {
    const use = session.interactionUses.find(
      ({ interactionId }) => interactionId === interaction.id,
    );
    const prerequisitesMet =
      interaction.requiredDiscoveryIds.every((id) => discoveries.has(id)) &&
      interaction.requiredInteractionIds.every((id) => completed.has(id)) &&
      interaction.requiredFactIds.every((id) => facts.has(id));
    const registered = session.phase !== 'COMPLETE' && prerequisitesMet && !use;
    return {
      interaction,
      prerequisitesMet,
      registered,
      callable: session.phase === 'READY' && registered,
      useStatus: use?.status ?? 'unused',
    };
  });
}

export function deriveToolSurface(
  definition: ExperienceDefinition,
  session: ExperienceSession | null,
): string[] {
  if (!session) return [];
  return [
    CORE_TOOL_NAMES.getState,
    CORE_TOOL_NAMES.beginTurn,
    CORE_TOOL_NAMES.commitChapter,
    ...(session.phase !== 'COMPLETE'
      ? deriveInteractionSurface(definition, session)
          .filter(({ registered }) => registered)
          .map(({ interaction }) => interaction.toolName)
      : []),
  ];
}

export function toStoryState(
  definition: ExperienceDefinition,
  session: ExperienceSession,
): StoryStateSnapshot {
  const latest = session.chapters.at(-1)!;
  const interactions = availableInteractions(definition, session).map(
    ({ id, toolName, title, cue }): AvailableInteraction => ({
      id,
      toolName,
      title,
      cue,
    }),
  );
  const mode =
    session.phase === 'AWAITING_CHAPTER'
      ? 'recovering'
      : session.phase === 'COMPLETE'
        ? 'complete'
        : session.chapters.length === 1
          ? 'opening'
          : 'continuing';
  return {
    experienceId: session.experienceId,
    storyId: session.storyId,
    sessionId: session.sessionId,
    revision: session.revision,
    phase: session.phase,
    bootstrap: {
      protocolVersion: LIVING_MANUSCRIPT_PROTOCOL_VERSION,
      contractVersion: definition.agentContract.version,
      instructions: definition.agentContract.instructions,
      mode,
    },
    requiredNextTool:
      session.phase === 'AWAITING_CHAPTER'
        ? CORE_TOOL_NAMES.commitChapter
        : 'none',
    requiredChapterStatus: requiredChapterStatus(definition, session),
    allowedNextTools:
      session.phase === 'READY'
        ? [
            CORE_TOOL_NAMES.beginTurn,
            ...interactions.map(({ toolName }) => toolName),
          ]
        : session.phase === 'AWAITING_CHAPTER'
          ? [CORE_TOOL_NAMES.commitChapter]
          : [],
    continuitySummary: session.continuitySummary.slice(
      0,
      SNAPSHOT_SUMMARY_LENGTH,
    ),
    latestChapter: {
      title: latest.title,
      excerpt: latest.prose.slice(-SNAPSHOT_EXCERPT_LENGTH),
    },
    pending: session.pendingTurn
      ? {
          turnId: session.pendingTurn.turnId,
          kind: session.pendingTurn.kind,
          playerChoice: session.pendingTurn.playerChoice.slice(
            0,
            SNAPSHOT_CHOICE_LENGTH,
          ),
          interactionId: session.pendingTurn.interactionId,
          effectReceipt: session.pendingTurn.effectReceipt,
        }
      : null,
    availableInteractions: interactions,
  };
}

export function getStateResponse(
  definition: ExperienceDefinition,
  session: ExperienceSession,
): ToolResponse {
  return { ok: true, state: toStoryState(definition, session) };
}

export function beginStoryTurn(
  definition: ExperienceDefinition,
  session: ExperienceSession,
  input: BeginStoryTurnInput,
  context: EngineContext = defaultEngineContext,
): EngineOutcome {
  const preflight = preflightMutation(
    definition,
    session,
    'begin_turn',
    input,
    () => validateTurnInput(definition, session, input),
  );
  if (preflight.outcome) return preflight.outcome;
  const { fingerprint } = preflight;
  if (session.phase === 'AWAITING_CHAPTER')
    return unchanged(
      session,
      failure(
        definition,
        'CHAPTER_REQUIRED',
        'Finish the saved turn with commit_story_chapter before starting another.',
        session,
      ),
    );
  if (session.phase !== 'READY')
    return unchanged(
      session,
      failure(
        definition,
        'ACTION_UNAVAILABLE',
        'This manuscript is complete and no longer accepts new turns.',
        session,
      ),
    );

  const next = structuredClone(session);
  const turnId = context.id('turn');
  next.pendingTurn = {
    turnId,
    kind: 'choice',
    playerChoice: input.playerChoice
      .trim()
      .slice(0, RUNTIME_LIMITS.choiceMaxLength),
    createdAt: context.now(),
    interactionId: null,
    effectReceipt: null,
  };
  next.phase = 'AWAITING_CHAPTER';
  next.revision += 1;
  const response: ToolSuccess = {
    ok: true,
    state: toStoryState(definition, next),
    turnId,
  };
  recordOperation(next, {
    operationId: input.operationId,
    fingerprint,
    kind: 'begin_turn',
    replay: { revision: next.revision, turnId },
  });
  return { session: next, response };
}

export function invokeStoryInteraction(
  definition: ExperienceDefinition,
  session: ExperienceSession,
  input: InvokeInteractionInput,
  context: EngineContext = defaultEngineContext,
): EngineOutcome {
  const preflight = preflightMutation(
    definition,
    session,
    'interaction',
    input,
    () => validateTurnInput(definition, session, input),
  );
  if (preflight.outcome) return preflight.outcome;
  const { fingerprint } = preflight;
  if (session.phase === 'AWAITING_CHAPTER')
    return unchanged(
      session,
      failure(
        definition,
        'CHAPTER_REQUIRED',
        'Finish the saved turn before invoking a story object.',
        session,
      ),
    );
  if (session.phase !== 'READY')
    return unchanged(
      session,
      failure(
        definition,
        'ACTION_UNAVAILABLE',
        'The completed manuscript cannot invoke another story object.',
        session,
      ),
    );

  const interaction = definition.story.interactions.find(
    ({ id }) => id === input.interactionId,
  );
  if (!interaction)
    return unchanged(
      session,
      failure(
        definition,
        'INVALID_INPUT',
        'The requested interaction is not authored for this story.',
        session,
      ),
    );
  if (
    session.interactionUses.some(
      ({ interactionId }) => interactionId === interaction.id,
    )
  )
    return unchanged(
      session,
      failure(
        definition,
        'INTERACTION_USED',
        `${interaction.title} has already changed the manuscript.`,
        session,
      ),
    );
  if (
    !availableInteractions(definition, session).some(
      ({ id }) => id === interaction.id,
    )
  )
    return unchanged(
      session,
      failure(
        definition,
        'INTERACTION_LOCKED',
        `${interaction.title} is not available in the current story.`,
        session,
      ),
    );

  const next = structuredClone(session);
  const now = context.now();
  const receipt: InteractionEffectReceipt = {
    receiptId: context.id('effect'),
    interactionId: interaction.id,
    presentation: interaction.presentation,
    factIds: interaction.sealedFacts.map(({ id }) => id),
    facts: interaction.sealedFacts.map(({ id, value, agentNote }) => ({
      id,
      value,
      ...(agentNote !== undefined ? { agentNote } : {}),
    })),
    createdAt: now,
  };
  for (const fact of interaction.sealedFacts) {
    if (!next.facts.some(({ id }) => id === fact.id))
      next.facts.push({
        id: fact.id,
        value: fact.value,
        revealedByInteractionId: interaction.id,
        revealedAt: now,
      });
  }
  next.interactionUses.push({
    interactionId: interaction.id,
    status: 'pending',
    invokedAt: now,
    retiredAt: null,
    receiptId: receipt.receiptId,
  });
  const turnId = context.id('turn');
  next.pendingTurn = {
    turnId,
    kind: 'interaction',
    playerChoice: input.playerChoice
      .trim()
      .slice(0, RUNTIME_LIMITS.choiceMaxLength),
    createdAt: now,
    interactionId: interaction.id,
    effectReceipt: receipt,
  };
  next.phase = 'AWAITING_CHAPTER';
  next.revision += 1;
  const response: ToolSuccess = {
    ok: true,
    state: toStoryState(definition, next),
    turnId,
    effectReceipt: receipt,
  };
  recordOperation(next, {
    operationId: input.operationId,
    fingerprint,
    kind: 'interaction',
    replay: { revision: next.revision, turnId, receipt },
  });
  return { session: next, response };
}

export function commitStoryChapter(
  definition: ExperienceDefinition,
  session: ExperienceSession,
  input: CommitStoryChapterInput,
  context: EngineContext = defaultEngineContext,
): EngineOutcome {
  const preflight = preflightMutation(
    definition,
    session,
    'chapter',
    input,
    () => validateChapterEnvelope(definition, session, input),
  );
  if (preflight.outcome) return preflight.outcome;
  const { fingerprint } = preflight;
  const pending = session.pendingTurn;
  if (!pending || session.phase !== 'AWAITING_CHAPTER')
    return unchanged(
      session,
      failure(
        definition,
        'ACTION_UNAVAILABLE',
        'No saved turn is waiting for a chapter.',
        session,
      ),
    );
  if (input.turnId !== pending.turnId)
    return unchanged(
      session,
      failure(
        definition,
        'CHAPTER_REQUIRED',
        `Commit the exact pending turn ${pending.turnId}.`,
        session,
      ),
    );
  const contentError = validateChapterContent(definition, input);
  if (contentError)
    return unchanged(
      session,
      failure(definition, 'INVALID_INPUT', contentError, session),
    );

  const allowedDiscoveries = new Set(definition.story.discoveryIds);
  const invalidDiscoveries = input.discoveryIds.filter(
    (id) => !allowedDiscoveries.has(id),
  );
  if (invalidDiscoveries.length)
    return unchanged(
      session,
      failure(
        definition,
        'INVALID_DISCOVERY',
        `Only authored discoveryIds are accepted. Invalid: ${invalidDiscoveries.join(', ')}.`,
        session,
      ),
    );
  const lockedDiscoveries = input.discoveryIds.filter((id) =>
    isDiscoveryLocked(definition, session, id),
  );
  if (lockedDiscoveries.length)
    return unchanged(
      session,
      failure(
        definition,
        'INVALID_DISCOVERY',
        `These discoveries are not available at the current story stage: ${lockedDiscoveries.join(', ')}.`,
        session,
      ),
    );
  const leak = findSealedLeak(
    definition,
    session,
    `${input.title}\n${input.prose}\n${input.recordProse ?? ''}\n${input.continuitySummary}`,
  );
  if (leak)
    return unchanged(
      session,
      failure(
        definition,
        'SEALED_FACT_LEAK',
        'The chapter contains a protected story truth that has not been revealed by its interaction.',
        session,
      ),
    );

  const pendingReceipt = pending.effectReceipt;
  const represented = new Set(input.representedFactIds ?? []);
  if (pendingReceipt) {
    if (input.effectReceiptId !== pendingReceipt.receiptId)
      return unchanged(
        session,
        failure(
          definition,
          'CHAPTER_REQUIRED',
          `This turn carries effect receipt ${pendingReceipt.receiptId}: set effectReceiptId to ${pendingReceipt.receiptId} and representedFactIds to exactly [${pendingReceipt.factIds.join(', ')}]. Both fields are required while a receipt is pending.`,
          session,
        ),
      );
    const missing = pendingReceipt.factIds.filter((id) => !represented.has(id));
    const unexpected = [...represented].filter(
      (id) => !pendingReceipt.factIds.includes(id),
    );
    if (missing.length || unexpected.length)
      return unchanged(
        session,
        failure(
          definition,
          'INVALID_INPUT',
          [
            `representedFactIds must list every fact in receipt ${pendingReceipt.receiptId}.`,
            missing.length ? `Missing: ${missing.join(', ')}.` : '',
            unexpected.length ? `Unexpected: ${unexpected.join(', ')}.` : '',
          ]
            .filter(Boolean)
            .join(' '),
          session,
        ),
      );
  } else if (input.effectReceiptId || represented.size) {
    return unchanged(
      session,
      failure(
        definition,
        'INVALID_INPUT',
        'This ordinary turn has no effect receipt or sealed facts.',
        session,
      ),
    );
  }

  const requiredStatus = requiredChapterStatus(definition, session);
  if (
    (requiredStatus === 'continue' && input.status !== 'continue') ||
    (requiredStatus === 'complete' && input.status !== 'complete')
  )
    return unchanged(
      session,
      failure(
        definition,
        'ACTION_UNAVAILABLE',
        requiredStatus === 'complete'
          ? 'This final reveal must close the manuscript with status complete.'
          : 'This chapter must continue the manuscript before its ending.',
        session,
      ),
    );

  if (input.status === 'complete') {
    const revealedFacts = new Set(session.facts.map(({ id }) => id));
    const missingCompletionFacts =
      definition.story.completionRequiredFactIds.filter(
        (id) => !revealedFacts.has(id),
      );
    if (missingCompletionFacts.length)
      return unchanged(
        session,
        failure(
          definition,
          'ACTION_UNAVAILABLE',
          `The story cannot end before its required facts are revealed. Missing: ${missingCompletionFacts.join(', ')}.`,
          session,
        ),
      );
  }

  const next = structuredClone(session);
  const now = context.now();
  const chapter: StoryChapter = {
    id: context.id('chapter'),
    title: input.title.trim(),
    prose: normalizeParagraphs(input.prose),
    ...(definition.story.narration === 'record' && input.recordProse
      ? { recordProse: normalizeParagraphs(input.recordProse) }
      : {}),
    createdAt: now,
    turnId: pending.turnId,
    discoveryIds: [...new Set(input.discoveryIds)],
    effectReceiptId: pendingReceipt?.receiptId ?? null,
  };
  next.chapters.push(chapter);
  next.continuitySummary = input.continuitySummary.trim();
  for (const id of chapter.discoveryIds) {
    if (!next.discoveries.some((record) => record.id === id))
      next.discoveries.push({
        id,
        chapterId: chapter.id,
        discoveredAt: now,
      });
  }
  if (pending.interactionId) {
    const use = next.interactionUses.find(
      ({ interactionId }) => interactionId === pending.interactionId,
    );
    if (use) {
      use.status = 'retired';
      use.retiredAt = now;
    }
  }
  next.pendingTurn = null;
  next.phase = input.status === 'complete' ? 'COMPLETE' : 'READY';
  next.revision += 1;
  const response: ToolSuccess = {
    ok: true,
    state: toStoryState(definition, next),
    chapter,
  };
  recordOperation(next, {
    operationId: input.operationId,
    fingerprint,
    kind: 'chapter',
    replay: { revision: next.revision, chapterId: chapter.id },
  });
  return { session: next, response };
}

function preflightMutation(
  definition: ExperienceDefinition,
  session: ExperienceSession,
  kind: OperationRecord['kind'],
  input: MutationEnvelopeInput,
  validateInput: () => ToolFailure | null,
): MutationPreflight {
  const staleSession = validateSessionIdentity(definition, session, input);
  if (staleSession)
    return {
      fingerprint: '',
      outcome: unchanged(session, staleSession),
    };

  const fingerprint = stableFingerprint(kind, input);
  const duplicate = findOperation(session, input.operationId);
  if (duplicate)
    return {
      fingerprint,
      outcome: replayOrReuseError(definition, session, duplicate, fingerprint),
    };

  const invalid = validateInput();
  if (invalid) return { fingerprint, outcome: unchanged(session, invalid) };

  if (input.expectedRevision !== session.revision)
    return {
      fingerprint,
      outcome: unchanged(
        session,
        staleFailure(definition, session, input.expectedRevision),
      ),
    };

  return { fingerprint, outcome: null };
}

function validateTurnInput(
  definition: ExperienceDefinition,
  session: ExperienceSession,
  input: BeginStoryTurnInput,
): ToolFailure | null {
  if (
    !validOperationId(input.operationId) ||
    !Number.isInteger(input.expectedRevision) ||
    typeof input.playerChoice !== 'string' ||
    !input.playerChoice.trim() ||
    input.playerChoice.length > RUNTIME_LIMITS.choiceMaxLength
  )
    return failure(
      definition,
      'INVALID_INPUT',
      'Provide a unique operationId, current revision, and the latest explicit player choice (500 characters or fewer).',
      session,
    );
  return null;
}

function validateChapterEnvelope(
  definition: ExperienceDefinition,
  session: ExperienceSession,
  input: CommitStoryChapterInput,
): ToolFailure | null {
  if (
    validOperationId(input.operationId) &&
    Number.isInteger(input.expectedRevision)
  )
    return null;
  return failure(
    definition,
    'INVALID_INPUT',
    'Provide a unique operationId and current revision.',
    session,
  );
}

function validateSessionIdentity(
  definition: ExperienceDefinition,
  session: ExperienceSession,
  input: { expectedSessionId: string },
): ToolFailure | null {
  if (
    typeof input.expectedSessionId !== 'string' ||
    input.expectedSessionId !== session.sessionId
  )
    return failure(
      definition,
      'STALE_SESSION',
      'This call belongs to a previous manuscript. Read the current story state before making another change.',
      session,
    );
  return null;
}

function validateChapterContent(
  definition: ExperienceDefinition,
  input: CommitStoryChapterInput,
): string | null {
  const record = definition.story.narration === 'record';
  if (
    !input.title?.trim() ||
    input.title.trim().length > RUNTIME_LIMITS.chapterTitleMaxLength
  )
    return 'Use a short chapter title of 80 characters or fewer.';
  if (hasSecondPersonPronoun(input.title))
    return 'Use a neutral chapter title without second-person pronouns.';
  if (!record && input.recordProse !== undefined)
    return 'This story keeps no official record; omit recordProse.';
  if (!input.prose?.trim() || (record && !input.recordProse?.trim()))
    return record
      ? 'Provide both the player-facing prose and its official recordProse.'
      : 'Provide the player-facing prose.';
  const paragraphs = splitParagraphBlocks(input.prose);
  if (
    paragraphs.length < 1 ||
    paragraphs.length > RUNTIME_LIMITS.chapterParagraphsMax
  )
    return 'Write 1–3 short prose paragraphs.';
  const words = wordCount(input.prose);
  if (words < 20 || words > RUNTIME_LIMITS.chapterWordsMax)
    return `Keep the chapter between 20 and ${RUNTIME_LIMITS.chapterWordsMax} words.`;
  if (record && input.recordProse) {
    const recordParagraphs = splitParagraphBlocks(input.recordProse);
    if (recordParagraphs.length !== paragraphs.length)
      return 'prose and recordProse must use the same number of paragraphs.';
    const recordWords = wordCount(input.recordProse);
    if (recordWords < 20 || recordWords > RUNTIME_LIMITS.chapterWordsMax)
      return `Keep the chapter between 20 and ${RUNTIME_LIMITS.chapterWordsMax} words.`;
    if (hasSecondPersonPronoun(input.recordProse))
      return 'recordProse must not contain second-person pronouns.';
  }
  if (
    !input.continuitySummary?.trim() ||
    input.continuitySummary.length > RUNTIME_LIMITS.summaryMaxLength
  )
    return `Provide a continuitySummary of ${RUNTIME_LIMITS.summaryMaxLength} characters or fewer.`;
  if (!Array.isArray(input.discoveryIds))
    return 'discoveryIds must be an array.';
  if (input.status !== 'continue' && input.status !== 'complete')
    return 'status must be continue or complete.';
  return null;
}

function wordCount(value: string): number {
  return value.trim().split(/\s+/).length;
}

function requiredChapterStatus(
  definition: ExperienceDefinition,
  session: ExperienceSession,
): StoryStateSnapshot['requiredChapterStatus'] {
  if (session.phase !== 'AWAITING_CHAPTER' || !session.pendingTurn)
    return 'none';

  const pendingInteractionId = session.pendingTurn.interactionId;
  if (!pendingInteractionId) {
    const facts = new Set(session.facts.map(({ id }) => id));
    return definition.story.completionRequiredFactIds.every((id) =>
      facts.has(id),
    )
      ? 'either'
      : 'continue';
  }

  const interaction = definition.story.interactions.find(
    ({ id }) => id === pendingInteractionId,
  );
  if (!interaction || interaction.completionPolicy === 'must_continue')
    return 'continue';
  if (interaction.completionPolicy === 'must_complete') return 'complete';

  const facts = new Set(session.facts.map(({ id }) => id));
  return definition.story.completionRequiredFactIds.every((id) => facts.has(id))
    ? 'either'
    : 'continue';
}

function findSealedLeak(
  definition: ExperienceDefinition,
  session: ExperienceSession,
  text: string,
): string | null {
  const revealed = new Set(session.facts.map(({ id }) => id));
  const lowered = text.toLocaleLowerCase();
  for (const interaction of definition.story.interactions) {
    for (const fact of interaction.sealedFacts) {
      if (revealed.has(fact.id)) continue;
      for (const term of fact.protectedTerms) {
        if (lowered.includes(term.toLocaleLowerCase())) return term;
      }
    }
  }
  return null;
}

function isDiscoveryLocked(
  definition: ExperienceDefinition,
  session: ExperienceSession,
  discoveryId: string,
): boolean {
  if (session.discoveries.some(({ id }) => id === discoveryId)) return false;
  const requirement = definition.story.discoveryRequirements.find(
    ({ id }) => id === discoveryId,
  );
  if (!requirement) return false;
  const facts = new Set(session.facts.map(({ id }) => id));
  const completedInteractions = new Set(
    session.interactionUses
      .filter(({ status }) => status === 'retired')
      .map(({ interactionId }) => interactionId),
  );
  return (
    requirement.requiredFactIds.some((id) => !facts.has(id)) ||
    requirement.requiredInteractionIds.some(
      (id) => !completedInteractions.has(id),
    )
  );
}

function normalizeParagraphs(text: string): string {
  return splitParagraphBlocks(text)
    .map((paragraph) => paragraph.replace(/\s+/g, ' ').trim())
    .join('\n\n');
}

function staleFailure(
  definition: ExperienceDefinition,
  session: ExperienceSession,
  expectedRevision: number,
): ToolFailure {
  return failure(
    definition,
    'STALE_STATE',
    `Expected revision ${expectedRevision}, but the manuscript is revision ${session.revision}. Read state again.`,
    session,
  );
}

function recordOperation(
  session: ExperienceSession,
  record: OperationRecord,
): void {
  session.operationLedger.push(record);
  if (session.operationLedger.length > RUNTIME_LIMITS.ledgerRecordsMax)
    session.operationLedger.splice(
      0,
      session.operationLedger.length - RUNTIME_LIMITS.ledgerRecordsMax,
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
        'This operationId belongs to a different request. Create a new unique ID.',
        session,
      ),
    );
  const replayIsCurrent = session.revision === record.replay.revision;
  const chapter = record.replay.chapterId
    ? session.chapters.find(({ id }) => id === record.replay.chapterId)
    : undefined;
  return {
    session,
    response: {
      ok: true,
      state: toStoryState(definition, session),
      ...(replayIsCurrent && record.replay.turnId
        ? { turnId: record.replay.turnId }
        : {}),
      ...(replayIsCurrent && record.replay.receipt
        ? { effectReceipt: record.replay.receipt }
        : {}),
      ...(replayIsCurrent && chapter ? { chapter } : {}),
      idempotentReplay: true,
    },
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
): ToolFailure {
  return {
    ok: false,
    code,
    message,
    ...(session ? { state: toStoryState(definition, session) } : {}),
  };
}

function unchanged(
  session: ExperienceSession,
  response: ToolResponse,
): { session: ExperienceSession; response: ToolResponse } {
  return { session, response };
}

function validOperationId(value: string): boolean {
  if (typeof value !== 'string') return false;
  return new RegExp(
    `^[a-zA-Z0-9][a-zA-Z0-9_-]{${RUNTIME_LIMITS.operationIdMinLength - 1},${RUNTIME_LIMITS.idMaxLength - 1}}$`,
  ).test(value);
}
