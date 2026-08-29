import { ABILITY_DESCRIPTIONS, ABILITY_LABELS } from '../game/content';
import type { GameController } from '../game/controller';
import type {
  AbilityId,
  ActionInput,
  AttributeId,
  ManuscriptInput,
  ToolResponse,
} from '../game/types';

export type WebMCPStatus = 'connecting' | 'connected' | 'unavailable' | 'error';

const EMPTY_SCHEMA = {
  type: 'object',
  properties: {},
  additionalProperties: false,
};
const OPERATION_SCHEMA = {
  type: 'string',
  minLength: 6,
  description:
    'A unique ID for this exact tool call. Reuse it only when retrying the same call.',
};
const REVISION_SCHEMA = {
  type: 'integer',
  minimum: 1,
  description:
    'The exact revision returned by the most recent game tool result.',
};
const APPROACH_SCHEMA = {
  type: 'string',
  enum: ['wits', 'nerve', 'grace'],
  description:
    "Which character attribute best matches the player's described approach.",
};

export async function registerAdventureTools(
  controller: GameController,
  onStatus: (status: WebMCPStatus) => void,
): Promise<() => void> {
  const modelContext = document.modelContext;
  if (!modelContext) {
    onStatus('unavailable');
    return () => undefined;
  }

  onStatus('connecting');
  const lifetime = new AbortController();
  const abilityLeases = new Map<AbilityId, AbortController>();

  try {
    await Promise.all([
      modelContext.registerTool(
        {
          name: 'get_adventure_state',
          description:
            'Read the authoritative local state of The Last Manuscript. Always call this at the start, after interruption, after stale-state errors, or when a saved turn may need narration.',
          inputSchema: EMPTY_SCHEMA,
          annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            openWorldHint: false,
          },
          execute: async (_input, options) => {
            assertNotAborted(options?.signal);
            return webMCPResult(
              await controller.getState(),
              Boolean(options?.signal),
            );
          },
        },
        { signal: lifetime.signal },
      ),
      modelContext.registerTool(
        {
          name: 'perform_action',
          description:
            "Resolve one player action using the page's D20 and canonical rules. Use only an affordance targetId currently returned by the page. The saved result must be followed by write_manuscript_entry in the same turn.",
          inputSchema: {
            type: 'object',
            properties: {
              operationId: OPERATION_SCHEMA,
              expectedRevision: REVISION_SCHEMA,
              targetId: {
                type: 'string',
                description:
                  'An exact current affordance ID from get_adventure_state.',
              },
              approach: APPROACH_SCHEMA,
              intent: {
                type: 'string',
                minLength: 1,
                maxLength: 280,
                description:
                  'A concise restatement of what the player is trying to do.',
              },
            },
            required: [
              'operationId',
              'expectedRevision',
              'targetId',
              'approach',
              'intent',
            ],
            additionalProperties: false,
          },
          annotations: {
            readOnlyHint: false,
            destructiveHint: false,
            openWorldHint: false,
          },
          execute: async (raw, options) => {
            assertNotAborted(options?.signal);
            return webMCPResult(
              await controller.performAction(readAction(raw)),
              Boolean(options?.signal),
            );
          },
        },
        { signal: lifetime.signal },
      ),
      modelContext.registerTool(
        {
          name: 'write_manuscript_entry',
          description:
            'Write the exact pending saved result into the manuscript. Write one natural 35–60 word paragraph, acknowledge every canonical event ID, and do not invent facts. This is the only legal mutation while narration is pending.',
          inputSchema: {
            type: 'object',
            properties: {
              operationId: OPERATION_SCHEMA,
              expectedRevision: REVISION_SCHEMA,
              resolutionId: {
                type: 'string',
                description: 'The exact pending resolutionId.',
              },
              representedEventIds: {
                type: 'array',
                items: { type: 'string' },
                minItems: 1,
                description:
                  'Every canonical event ID represented in the prose.',
              },
              prose: {
                type: 'string',
                minLength: 80,
                maxLength: 700,
                description:
                  'One natural 35–60 word manuscript paragraph grounded only in the saved facts.',
              },
            },
            required: [
              'operationId',
              'expectedRevision',
              'resolutionId',
              'representedEventIds',
              'prose',
            ],
            additionalProperties: false,
          },
          annotations: {
            readOnlyHint: false,
            destructiveHint: false,
            openWorldHint: false,
          },
          execute: async (raw, options) => {
            assertNotAborted(options?.signal);
            return webMCPResult(
              await controller.writeManuscript(readManuscript(raw)),
              Boolean(options?.signal),
            );
          },
        },
        { signal: lifetime.signal },
      ),
    ]);
    onStatus('connected');
  } catch (error) {
    console.error('WebMCP registration failed', error);
    onStatus('error');
  }

  const syncAbilities = (): void => {
    const snapshot = controller.getSnapshot();
    const unlocked = new Set(
      snapshot?.phase === 'COMPLETE'
        ? []
        : (snapshot?.unlockedAbilityIds ?? []).filter(
            (id) => !snapshot?.usedAbilityIds.includes(id),
          ),
    );
    for (const abilityId of abilityLeases.keys()) {
      if (!unlocked.has(abilityId)) {
        abilityLeases.get(abilityId)?.abort();
        abilityLeases.delete(abilityId);
      }
    }
    for (const abilityId of unlocked) {
      if (!abilityLeases.has(abilityId))
        void registerAbility(
          modelContext,
          controller,
          abilityId,
          abilityLeases,
          onStatus,
        );
    }
  };
  syncAbilities();
  const unsubscribe = controller.subscribe(syncAbilities);

  return () => {
    unsubscribe();
    for (const lease of abilityLeases.values()) lease.abort();
    lifetime.abort();
  };
}

async function registerAbility(
  modelContext: WebMCPModelContext,
  controller: GameController,
  abilityId: AbilityId,
  leases: Map<AbilityId, AbortController>,
  onStatus: (status: WebMCPStatus) => void,
): Promise<void> {
  const lease = new AbortController();
  leases.set(abilityId, lease);
  try {
    await modelContext.registerTool(
      {
        name: abilityId,
        description: `${ABILITY_LABELS[abilityId]} — ${ABILITY_DESCRIPTIONS[abilityId]} Use only when unlocked in the saved state, then write the returned pending manuscript entry.`,
        inputSchema: {
          type: 'object',
          properties: {
            operationId: OPERATION_SCHEMA,
            expectedRevision: REVISION_SCHEMA,
            approach: APPROACH_SCHEMA,
            intent: {
              type: 'string',
              minLength: 1,
              maxLength: 280,
              description:
                'How the player invokes this ability in the current scene.',
            },
          },
          required: ['operationId', 'expectedRevision', 'approach', 'intent'],
          additionalProperties: false,
        },
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          openWorldHint: false,
        },
        execute: async (raw, options) => {
          assertNotAborted(options?.signal);
          return webMCPResult(
            await controller.performAction({
              ...readAbility(raw),
              targetId: abilityId,
            }),
            Boolean(options?.signal),
          );
        },
      },
      { signal: lease.signal },
    );
  } catch (error) {
    if (!lease.signal.aborted) {
      console.error(`Could not register ${abilityId}`, error);
      onStatus('error');
    }
  }
}

function readAction(raw: Record<string, unknown>): ActionInput {
  return {
    operationId: stringValue(raw.operationId),
    expectedRevision: numberValue(raw.expectedRevision),
    targetId: stringValue(raw.targetId),
    approach: attributeValue(raw.approach),
    intent: stringValue(raw.intent),
  };
}

function readAbility(
  raw: Record<string, unknown>,
): Omit<ActionInput, 'targetId'> {
  return {
    operationId: stringValue(raw.operationId),
    expectedRevision: numberValue(raw.expectedRevision),
    approach: attributeValue(raw.approach),
    intent: stringValue(raw.intent),
  };
}

function readManuscript(raw: Record<string, unknown>): ManuscriptInput {
  return {
    operationId: stringValue(raw.operationId),
    expectedRevision: numberValue(raw.expectedRevision),
    resolutionId: stringValue(raw.resolutionId),
    representedEventIds: Array.isArray(raw.representedEventIds)
      ? raw.representedEventIds.filter(
          (value): value is string => typeof value === 'string',
        )
      : [],
    prose: stringValue(raw.prose),
  };
}

function webMCPResult(
  result: ToolResponse,
  hasExecutionSignal: boolean,
): {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent: ToolResponse & { clientCancellation: string };
} {
  const text = result.ok
    ? result.resolution
      ? `Roll saved as ${result.resolution.resolutionId}. You must now call write_manuscript_entry for this exact result before any new action.`
      : result.manuscriptEntry
        ? `Manuscript page ${result.manuscriptEntry.turn} saved. Revision is now ${result.state.revision}.`
        : `Adventure state read. Required next tool: ${result.state.requiredNextTool}.`
    : `${result.code}: ${result.message}`;
  const structuredContent = {
    ...result,
    clientCancellation: hasExecutionSignal
      ? 'available'
      : 'unavailable_device_local_only',
  };
  return {
    content: [
      {
        type: 'text',
        text: `${text}\nClient cancellation: ${structuredContent.clientCancellation}.\n\n${JSON.stringify(structuredContent)}`,
      },
    ],
    structuredContent,
  };
}

function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted)
    throw new DOMException(
      'The tool call was cancelled before it changed the manuscript.',
      'AbortError',
    );
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
function numberValue(value: unknown): number {
  return typeof value === 'number' ? value : Number.NaN;
}
function attributeValue(value: unknown): AttributeId {
  return typeof value === 'string'
    ? (value as AttributeId)
    : ('' as AttributeId);
}
