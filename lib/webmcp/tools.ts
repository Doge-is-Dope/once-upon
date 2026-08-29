import { isNarrationPayload } from '../runtime/narration';
import type { ExperienceController } from '../runtime/controller';
import type {
  AbilityId,
  ActionInput,
  AttributeId,
  NarrationInput,
  ToolResponse,
} from '../runtime/types';

export type WebMCPStatus =
  | 'connecting'
  | 'connected'
  | 'disabled'
  | 'unsupported'
  | 'error';

export const CHROME_WEBMCP_MIN_VERSION = 149;

type BrowserBrand = {
  brand: string;
  version: string;
};

export type WebMCPNavigator = Navigator & {
  userAgentData?: {
    brands: BrowserBrand[];
  };
};

export function classifyMissingWebMCP(
  navigatorLike: WebMCPNavigator,
): Extract<WebMCPStatus, 'disabled' | 'unsupported'> {
  const chrome = navigatorLike.userAgentData?.brands.find(
    ({ brand }) => brand === 'Google Chrome',
  );
  if (!chrome) return 'unsupported';
  const majorVersion = Number.parseInt(chrome.version, 10);
  return Number.isInteger(majorVersion) &&
    majorVersion >= CHROME_WEBMCP_MIN_VERSION
    ? 'disabled'
    : 'unsupported';
}

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
    'The exact revision returned by the most recent experience tool result.',
};
export async function registerExperienceTools(
  controller: ExperienceController,
  onStatus: (status: WebMCPStatus) => void,
): Promise<() => void> {
  const modelContext = document.modelContext;
  if (!modelContext) {
    onStatus(classifyMissingWebMCP(navigator as WebMCPNavigator));
    return () => undefined;
  }

  onStatus('connecting');
  const lifetime = new AbortController();
  const abilityLeases = new Map<AbilityId, AbortController>();
  const approachSchema = {
    type: 'string',
    enum: controller.definition.story.attributes.map((attribute) => attribute.id),
    description:
      "Which character attribute best matches the player's described approach.",
  };

  try {
    await Promise.all([
      modelContext.registerTool(
        {
          name: 'get_story_state',
          description: `Read the authoritative local state of ${controller.definition.title}. Always call this at the start, after interruption, after stale-state errors, or when a saved turn may need narration.`,
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
            "Resolve one player action using the experience's D20 and canonical rules. Use only an affordance targetId currently returned by get_story_state. Follow a saved result with commit_narration before any new action.",
          inputSchema: {
            type: 'object',
            properties: {
              operationId: OPERATION_SCHEMA,
              expectedRevision: REVISION_SCHEMA,
              targetId: {
                type: 'string',
                description:
                  'An exact current affordance ID from get_story_state.',
              },
              approach: approachSchema,
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
          name: 'commit_narration',
          description: `Commit narration for the exact pending saved result. ${controller.definition.narration.instruction} Acknowledge every canonical event ID and do not invent facts. This is the only legal mutation while narration is pending.`,
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
                  'Every canonical event ID represented in the narration payload.',
              },
              payload: controller.definition.narration.inputSchema,
            },
            required: [
              'operationId',
              'expectedRevision',
              'resolutionId',
              'representedEventIds',
              'payload',
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
              await controller.commitNarration(readNarration(raw)),
              Boolean(options?.signal),
            );
          },
        },
        { signal: lifetime.signal },
      ),
    ]);
    onStatus('connected');
  } catch (error) {
    lifetime.abort();
    for (const lease of abilityLeases.values()) lease.abort();
    abilityLeases.clear();
    if (isPermissionDenied(error)) onStatus('disabled');
    else {
      console.error('WebMCP registration failed', error);
      onStatus('error');
    }
    return () => undefined;
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
  controller: ExperienceController,
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
        description: `${controller.definition.story.abilityLabel(abilityId)} — ${controller.definition.story.abilityDescription(abilityId)} Use only when unlocked in the saved state, then commit narration for the returned pending result.`,
        inputSchema: {
          type: 'object',
          properties: {
            operationId: OPERATION_SCHEMA,
            expectedRevision: REVISION_SCHEMA,
            approach: {
              type: 'string',
              enum: controller.definition.story.attributes.map((attribute) => attribute.id),
              description:
                "Which character attribute best matches the player's described approach.",
            },
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
      lease.abort();
      leases.delete(abilityId);
      if (isPermissionDenied(error)) onStatus('disabled');
      else {
        console.error(`Could not register ${abilityId}`, error);
        onStatus('error');
      }
    }
  }
}

function isPermissionDenied(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    error.name === 'NotAllowedError'
  );
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

function readNarration(raw: Record<string, unknown>): NarrationInput {
  return {
    operationId: stringValue(raw.operationId),
    expectedRevision: numberValue(raw.expectedRevision),
    resolutionId: stringValue(raw.resolutionId),
    representedEventIds: Array.isArray(raw.representedEventIds)
      ? raw.representedEventIds.filter(
          (value): value is string => typeof value === 'string',
        )
      : [],
    payload: isNarrationPayload(raw.payload)
      ? raw.payload
      : { format: 'prose', text: '' },
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
      ? `Roll saved as ${result.resolution.resolutionId}. You must now call commit_narration for this exact result before any new action.`
      : result.narrationEntry
        ? `Narration for turn ${result.narrationEntry.turn} saved. Revision is now ${result.state.revision}.`
        : `Story state read. Required next tool: ${result.state.requiredNextTool}.`
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
      'The tool call was cancelled before it changed the story.',
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
  return typeof value === 'string' ? value : '';
}
