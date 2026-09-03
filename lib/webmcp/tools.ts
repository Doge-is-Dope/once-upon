import { deriveToolSurface } from '../runtime/engine';
import { CORE_TOOL_NAMES, RUNTIME_LIMITS } from '../runtime/protocol';
import type { ExperienceController } from '../runtime/controller';
import {
  describeTypingSeconds,
  estimateTypingMs,
} from '../manuscript/typing-plan';
import type {
  BeginStoryTurnInput,
  CommitStoryChapterInput,
  ExperienceDefinition,
  StoryStateSnapshot,
  ToolFailure,
  ToolResponse,
} from '../runtime/types';

export type WebMCPStatus =
  | 'connecting'
  | 'connected'
  | 'disabled'
  | 'unsupported'
  | 'error';

const EMPTY_SCHEMA = {
  type: 'object',
  properties: {},
  additionalProperties: false,
};
const OPERATION_SCHEMA = {
  type: 'string',
  minLength: 6,
  maxLength: RUNTIME_LIMITS.idMaxLength,
  description: 'Unique call ID; reuse only for an identical retry.',
};
const SESSION_SCHEMA = {
  type: 'string',
  minLength: 1,
  maxLength: RUNTIME_LIMITS.idMaxLength,
  description: 'Exact latest manuscript session ID.',
};
const REVISION_SCHEMA = {
  type: 'integer',
  minimum: 1,
  description: 'Exact latest manuscript revision.',
};
const PLAYER_CHOICE_SCHEMA = {
  type: 'string',
  minLength: 1,
  maxLength: RUNTIME_LIMITS.choiceMaxLength,
  description: "The player's latest explicit choice, kept verbatim.",
};
const TURN_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    operationId: OPERATION_SCHEMA,
    expectedSessionId: SESSION_SCHEMA,
    expectedRevision: REVISION_SCHEMA,
    playerChoice: PLAYER_CHOICE_SCHEMA,
  },
  required: [
    'operationId',
    'expectedSessionId',
    'expectedRevision',
    'playerChoice',
  ],
  additionalProperties: false,
};
const PROTOCOL_BEFORE_RECORD =
  "The webpage is the canonical story. Read its state before every player turn. If the state is AWAITING_CHAPTER, commit that exact pending turn before any narrative, question, or new action. If it is READY and the user's latest message already contains an explicit character action, carry it out immediately instead of asking them to repeat it. Use a currently available story-object tool only when that latest message explicitly performs the action in its description; a mention, question, or recollection is not permission to consume it. Otherwise use begin_story_turn with the player's choice verbatim. After either mutation, call commit_story_chapter in the same assistant response and put all 1–3 prose paragraphs there.";
const PROTOCOL_RECORD_LAYER =
  'Submit an equivalent official recordProse with identical events and paragraph structure, changing every second-person reference—including quotations, notes, and testimony—to grammatically complete third-person references to the subject. Never add a new event or reveal the hidden rewrite.';
const PROTOCOL_PROSE_ONLY = 'Never add a new event.';
const PROTOCOL_AFTER_RECORD =
  'Never leave new story prose only in chat. Do not reply with narrative or another question until the commit succeeds. After a successful commit the page reveals the chapter at reading speed and the player reads it there; never paste, paraphrase, or summarize the saved prose in chat. Reply with one short line inviting the next move. If the user has not supplied a character action, ask what they do.';

/** The shared turn protocol, with the record-layer sentences only for stories that keep one. */
export function livingManuscriptProtocol(
  definition: ExperienceDefinition,
): string {
  const record = definition.story.narration === 'record';
  return `${PROTOCOL_BEFORE_RECORD} ${record ? PROTOCOL_RECORD_LAYER : PROTOCOL_PROSE_ONLY} ${PROTOCOL_AFTER_RECORD}`;
}

export type ToolActivity =
  | { toolName: string; phase: 'invoked' }
  | {
      toolName: string;
      phase: 'settled';
      ok: boolean;
      code?: ToolFailure['code'] | 'ABORTED' | 'ERROR';
      message?: string;
    };

export async function registerExperienceTools(
  controller: ExperienceController,
  onStatus: (status: WebMCPStatus) => void,
  onToolActivity?: (activity: ToolActivity) => void,
  lifecycleSignal?: AbortSignal,
): Promise<() => void> {
  const modelContext = document.modelContext;
  if (!modelContext) {
    onStatus('unsupported');
    return () => undefined;
  }
  const context = modelContext;

  onStatus('connecting');
  const leases = new Map<string, AbortController>();
  const executing = new Map<string, number>();
  let disposed = false;
  let registrationFailed = false;
  let reconcileAgain = false;
  let reconcileQueue: Promise<void> = Promise.resolve();
  let unsubscribe: () => void = () => undefined;

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    unsubscribe();
    lifecycleSignal?.removeEventListener('abort', dispose);
    for (const lease of leases.values()) lease.abort();
    leases.clear();
  };

  if (lifecycleSignal?.aborted) {
    dispose();
    return dispose;
  }
  lifecycleSignal?.addEventListener('abort', dispose, { once: true });

  const scheduleReconcile = (): void => {
    if (disposed || registrationFailed) return;
    reconcileQueue = reconcileQueue.then(reconcile).catch((error) => {
      if (disposed) return;
      registrationFailed = true;
      for (const lease of leases.values()) lease.abort();
      leases.clear();
      if (isPermissionDenied(error)) onStatus('disabled');
      else {
        console.error('WebMCP registration failed', error);
        onStatus('error');
      }
    });
  };

  const execute = async (
    toolName: string,
    work: () => Promise<ToolResponse>,
    signal?: AbortSignal,
  ) => {
    assertNotAborted(signal);
    executing.set(toolName, (executing.get(toolName) ?? 0) + 1);
    onToolActivity?.({ toolName, phase: 'invoked' });
    let settled: Extract<ToolActivity, { phase: 'settled' }> = {
      toolName,
      phase: 'settled',
      ok: false,
      code: 'ERROR',
    };
    try {
      const response = await work();
      settled = response.ok
        ? { toolName, phase: 'settled', ok: true }
        : {
            toolName,
            phase: 'settled',
            ok: false,
            code: response.code,
            message: response.message,
          };
      return webMCPResult(response, Boolean(signal), controller.definition);
    } catch (error) {
      if (isAbortError(error))
        settled = { toolName, phase: 'settled', ok: false, code: 'ABORTED' };
      throw error;
    } finally {
      const remaining = (executing.get(toolName) ?? 1) - 1;
      if (remaining > 0) executing.set(toolName, remaining);
      else executing.delete(toolName);
      onToolActivity?.(settled);
      if (reconcileAgain && !disposed) {
        reconcileAgain = false;
        globalThis.setTimeout(scheduleReconcile, 0);
      }
    }
  };

  async function reconcile(): Promise<void> {
    if (disposed) return;
    const desired = deriveToolSurface(
      controller.definition,
      controller.getSnapshot(),
    );
    const desiredSet = new Set(desired);
    for (const [name, lease] of leases) {
      if (desiredSet.has(name)) continue;
      if (executing.has(name)) {
        reconcileAgain = true;
        continue;
      }
      lease.abort();
      leases.delete(name);
    }
    for (const name of desired) {
      if (disposed || leases.has(name)) continue;
      const lease = new AbortController();
      leases.set(name, lease);
      try {
        await context.registerTool(makeTool(controller, name, execute), {
          signal: lease.signal,
        });
      } catch (error) {
        lease.abort();
        leases.delete(name);
        throw error;
      }
    }
  }

  unsubscribe = controller.subscribe(scheduleReconcile);
  scheduleReconcile();
  try {
    await reconcileQueue;
    if (!disposed && !registrationFailed) onStatus('connected');
  } catch {
    // scheduleReconcile maps registration errors to a user-facing status.
  }

  return dispose;
}

function makeTool(
  controller: ExperienceController,
  name: string,
  execute: (
    toolName: string,
    work: () => Promise<ToolResponse>,
    signal?: AbortSignal,
  ) => Promise<ReturnType<typeof webMCPResult>>,
): WebMCPToolDefinition {
  const commonAnnotations = {
    readOnlyHint: false,
    destructiveHint: false,
    openWorldHint: false,
    untrustedContentHint: true,
  };
  if (name === CORE_TOOL_NAMES.getState)
    return {
      name,
      title: `Start or resume ${controller.definition.title}`,
      description: `Read the canonical manuscript before every player turn. Use it to start or resume ${controller.definition.title}, then follow the returned instructions and allowedNextTools.`,
      inputSchema: EMPTY_SCHEMA,
      annotations: { ...commonAnnotations, readOnlyHint: true },
      execute: (raw, options) =>
        execute(
          name,
          () =>
            exactObject(raw, [], [])
              ? controller.getState()
              : Promise.resolve(
                  controller.invalidInput(
                    'get_story_state accepts no input fields.',
                  ),
                ),
          options?.signal,
        ),
    };
  if (name === CORE_TOOL_NAMES.beginTurn)
    return {
      name,
      title: 'Begin a story turn',
      description:
        "Save the player's latest free choice when allowedNextTools includes this tool. Then call commit_story_chapter in the same response.",
      inputSchema: TURN_INPUT_SCHEMA,
      annotations: commonAnnotations,
      execute: (raw, options) =>
        execute(
          name,
          () =>
            parseAndRun(
              controller,
              () => readBeginTurn(raw),
              (input) => controller.beginStoryTurn(input, options?.signal),
            ),
          options?.signal,
        ),
    };
  if (name === CORE_TOOL_NAMES.commitChapter)
    return {
      name,
      title: 'Commit the next chapter',
      description:
        'Finish the exact pending turn when requiredNextTool names this tool. Save all 1–3 prose paragraphs to the webpage before replying.',
      inputSchema: {
        type: 'object',
        properties: {
          operationId: OPERATION_SCHEMA,
          expectedSessionId: SESSION_SCHEMA,
          expectedRevision: REVISION_SCHEMA,
          turnId: {
            type: 'string',
            minLength: 1,
            maxLength: RUNTIME_LIMITS.idMaxLength,
            description: 'Exact pending turn ID.',
          },
          title: {
            type: 'string',
            minLength: 1,
            maxLength: RUNTIME_LIMITS.chapterTitleMaxLength,
          },
          prose: {
            type: 'string',
            minLength: 20,
            maxLength: RUNTIME_LIMITS.chapterTextMaxLength,
            description: 'One to three short story paragraphs.',
          },
          ...(controller.definition.story.narration === 'record'
            ? {
                recordProse: {
                  type: 'string',
                  minLength: 20,
                  maxLength: RUNTIME_LIMITS.chapterTextMaxLength,
                  description:
                    'The same events and paragraph structure as prose, rewritten as a grammatically complete official record using the subject and no second-person pronouns.',
                },
              }
            : {}),
          continuitySummary: {
            type: 'string',
            minLength: 1,
            maxLength: RUNTIME_LIMITS.summaryMaxLength,
            description: 'Compact current continuity for the next turn.',
          },
          discoveryIds: {
            type: 'array',
            maxItems: controller.definition.story.discoveryIds.length,
            uniqueItems: true,
            items: {
              type: 'string',
              enum: [...controller.definition.story.discoveryIds],
            },
            description: 'Authored discoveries established in this prose.',
          },
          status: { type: 'string', enum: ['continue', 'complete'] },
          effectReceiptId: {
            type: 'string',
            description: 'Exact pending effect receipt, when present.',
          },
          representedFactIds: {
            type: 'array',
            maxItems: controller.definition.story.interactions.reduce(
              (count, interaction) =>
                Math.max(count, interaction.sealedFacts.length),
              0,
            ),
            uniqueItems: true,
            items: {
              type: 'string',
              enum: controller.definition.story.interactions.flatMap(
                ({ sealedFacts }) => sealedFacts.map(({ id }) => id),
              ),
            },
            description: 'Every fact ID in the pending effect receipt.',
          },
        },
        required: [
          'operationId',
          'expectedSessionId',
          'expectedRevision',
          'turnId',
          'title',
          'prose',
          ...(controller.definition.story.narration === 'record'
            ? ['recordProse']
            : []),
          'continuitySummary',
          'discoveryIds',
          'status',
        ],
        additionalProperties: false,
      },
      annotations: commonAnnotations,
      execute: (raw, options) =>
        execute(
          name,
          () =>
            parseAndRun(
              controller,
              () => readChapter(controller, raw),
              (input) => controller.commitStoryChapter(input, options?.signal),
            ),
          options?.signal,
        ),
    };

  const interaction = controller.definition.story.interactions.find(
    ({ toolName }) => toolName === name,
  );
  if (!interaction) throw new Error(`Unknown derived tool: ${name}`);
  return {
    name,
    title: interaction.title,
    description: `${interaction.description} After success, call commit_story_chapter in the same response before replying.`,
    inputSchema: TURN_INPUT_SCHEMA,
    annotations: commonAnnotations,
    execute: (raw, options) =>
      execute(
        name,
        () =>
          parseAndRun(
            controller,
            () => readBeginTurn(raw),
            (input) =>
              controller.invokeInteraction(
                { ...input, interactionId: interaction.id },
                options?.signal,
              ),
          ),
        options?.signal,
      ),
  };
}

function readBeginTurn(raw: Record<string, unknown>): BeginStoryTurnInput {
  requireExactObject(raw, [
    'operationId',
    'expectedSessionId',
    'expectedRevision',
    'playerChoice',
  ]);
  return {
    operationId: requiredString(
      raw.operationId,
      'operationId',
      RUNTIME_LIMITS.idMaxLength,
    ),
    expectedSessionId: requiredString(
      raw.expectedSessionId,
      'expectedSessionId',
      RUNTIME_LIMITS.idMaxLength,
    ),
    expectedRevision: requiredInteger(raw.expectedRevision, 'expectedRevision'),
    playerChoice: requiredString(
      raw.playerChoice,
      'playerChoice',
      RUNTIME_LIMITS.choiceMaxLength,
    ),
  };
}

function readChapter(
  controller: ExperienceController,
  raw: Record<string, unknown>,
): CommitStoryChapterInput {
  const record = controller.definition.story.narration === 'record';
  requireExactObject(
    raw,
    [
      'operationId',
      'expectedSessionId',
      'expectedRevision',
      'turnId',
      'title',
      'prose',
      ...(record ? ['recordProse'] : []),
      'continuitySummary',
      'discoveryIds',
      'status',
    ],
    ['effectReceiptId', 'representedFactIds'],
  );
  if (raw.status !== 'continue' && raw.status !== 'complete')
    throw new InputError('status must be exactly continue or complete.');
  const discoveryIds = requiredStringArray(raw.discoveryIds, 'discoveryIds');
  const knownDiscoveries = new Set(controller.definition.story.discoveryIds);
  rejectUnknownIds(discoveryIds, knownDiscoveries, 'discoveryIds');
  const knownFacts = new Set(
    controller.definition.story.interactions.flatMap(({ sealedFacts }) =>
      sealedFacts.map(({ id }) => id),
    ),
  );
  const representedFactIds =
    raw.representedFactIds === undefined
      ? undefined
      : requiredStringArray(raw.representedFactIds, 'representedFactIds');
  if (representedFactIds)
    rejectUnknownIds(representedFactIds, knownFacts, 'representedFactIds');
  return {
    operationId: requiredString(
      raw.operationId,
      'operationId',
      RUNTIME_LIMITS.idMaxLength,
    ),
    expectedSessionId: requiredString(
      raw.expectedSessionId,
      'expectedSessionId',
      RUNTIME_LIMITS.idMaxLength,
    ),
    expectedRevision: requiredInteger(raw.expectedRevision, 'expectedRevision'),
    turnId: requiredString(raw.turnId, 'turnId', RUNTIME_LIMITS.idMaxLength),
    title: requiredString(
      raw.title,
      'title',
      RUNTIME_LIMITS.chapterTitleMaxLength,
    ),
    prose: requiredString(
      raw.prose,
      'prose',
      RUNTIME_LIMITS.chapterTextMaxLength,
    ),
    ...(record
      ? {
          recordProse: requiredString(
            raw.recordProse,
            'recordProse',
            RUNTIME_LIMITS.chapterTextMaxLength,
          ),
        }
      : {}),
    continuitySummary: requiredString(
      raw.continuitySummary,
      'continuitySummary',
      RUNTIME_LIMITS.summaryMaxLength,
    ),
    discoveryIds,
    status: raw.status,
    ...(raw.effectReceiptId !== undefined
      ? {
          effectReceiptId: requiredString(
            raw.effectReceiptId,
            'effectReceiptId',
            RUNTIME_LIMITS.idMaxLength,
          ),
        }
      : {}),
    ...(representedFactIds ? { representedFactIds } : {}),
  };
}

export type WebMCPToolResult = {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent: ToolResponse & {
    clientCancellation: string;
    pagePresentation?: { typingMs: number };
  };
};

function webMCPResult(
  result: ToolResponse,
  hasExecutionSignal: boolean,
  definition: ExperienceDefinition,
): WebMCPToolResult {
  const typingMs =
    result.ok && result.chapter
      ? estimateTypingMs(
          result.chapter.title,
          result.chapter.prose,
          result.state.phase === 'COMPLETE'
            ? definition.story.completionPassage.prose
            : '',
        )
      : null;
  const text = result.ok
    ? result.effectReceipt
      ? `The page changed. REQUIRED NEXT: commit receipt ${result.effectReceipt.receiptId} and its exact facts before any narrative or question.`
      : result.chapter
        ? result.state.phase === 'COMPLETE'
          ? `Final chapter saved. The page will finish the ending on its own (about ${describeTypingSeconds(typingMs ?? 0)} s). Reply with one short closing line and do not describe the ending.`
          : `Chapter saved at revision ${result.state.revision}. The page is typing it now (about ${describeTypingSeconds(typingMs ?? 0)} s) and the player is reading it there. Do not repeat or summarize it in chat. Reply with one short line inviting the next move.`
        : result.turnId
          ? `Player choice saved as turn ${result.turnId}. REQUIRED NEXT: call commit_story_chapter now, before any narrative or question. The player sees their move on the page and is waiting for the chapter.`
          : stateGuidance(definition, result.state)
    : `${result.code}: ${result.message}${result.state?.phase === 'AWAITING_CHAPTER' ? ' Do not narrate or ask a new question; finish the pending chapter first.' : ''}`;
  return {
    content: [{ type: 'text', text }],
    structuredContent: {
      ...result,
      clientCancellation: hasExecutionSignal
        ? 'before_commit_point'
        : 'unavailable_device_local_only',
      ...(typingMs !== null ? { pagePresentation: { typingMs } } : {}),
    },
  };
}

function stateGuidance(
  definition: ExperienceDefinition,
  state: StoryStateSnapshot,
): string {
  const contract = `${livingManuscriptProtocol(definition)} Story contract ${state.bootstrap.contractVersion}: ${state.bootstrap.instructions}`;
  if (state.phase === 'AWAITING_CHAPTER' && state.pending)
    return `${contract}\n\nA chapter is pending. Commit turn ${state.pending.turnId} before any narrative, question, or new action.`;
  if (state.phase === 'COMPLETE')
    return `${contract}\n\nThe manuscript is complete. Read it without starting another action.`;
  const storyObjectTools = state.availableInteractions.map(
    ({ toolName }) => toolName,
  );
  const objectGuidance = storyObjectTools.length
    ? ` An explicitly matching story-object action may use ${storyObjectTools.join(', ')}; otherwise use begin_story_turn.`
    : ' Use begin_story_turn for an explicit character action.';
  return `${contract}\n\nStory state read.${objectGuidance} If the latest user message contains no character action, ask what they do.`;
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    error.name === 'AbortError'
  );
}

function isPermissionDenied(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    error.name === 'NotAllowedError'
  );
}

function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted)
    throw new DOMException(
      'The tool call was cancelled before it changed the manuscript.',
      'AbortError',
    );
}

class InputError extends Error {}

async function parseAndRun<T>(
  controller: ExperienceController,
  parse: () => T,
  run: (input: T) => Promise<ToolResponse>,
): Promise<ToolResponse> {
  try {
    return await run(parse());
  } catch (error) {
    if (error instanceof InputError)
      return controller.invalidInput(error.message);
    throw error;
  }
}

function exactObject(
  raw: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): raw is Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const keys = Object.keys(raw);
  const allowed = new Set([...required, ...optional]);
  return (
    required.every((key) => Object.hasOwn(raw, key)) &&
    keys.every((key) => allowed.has(key))
  );
}

function requireExactObject(
  raw: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): asserts raw is Record<string, unknown> {
  if (!exactObject(raw, required, optional))
    throw new InputError(
      'Input must contain exactly the documented required and optional fields.',
    );
}

function requiredString(
  value: unknown,
  field: string,
  maxLength: number,
): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength)
    throw new InputError(
      `${field} must be a non-empty string of ${maxLength} characters or fewer.`,
    );
  return value;
}

function requiredInteger(value: unknown, field: string): number {
  if (!Number.isInteger(value) || (value as number) < 1)
    throw new InputError(`${field} must be a positive integer.`);
  return value as number;
}

function requiredStringArray(value: unknown, field: string): string[] {
  if (
    !Array.isArray(value) ||
    value.some((entry) => typeof entry !== 'string') ||
    new Set(value).size !== value.length
  )
    throw new InputError(`${field} must be an array of unique strings.`);
  return value as string[];
}

function rejectUnknownIds(
  ids: readonly string[],
  known: ReadonlySet<string>,
  field: string,
): void {
  const unknown = ids.filter((id) => !known.has(id));
  if (unknown.length)
    throw new InputError(
      `${field} contains unknown IDs: ${unknown.join(', ')}.`,
    );
}
