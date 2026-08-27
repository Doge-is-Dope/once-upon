'use client';

import type { PublicGameSnapshot, QuestionDraft, RoomBootstrap, Seat } from '@/lib/game/contracts';
import { gameGateway, type GameGateway } from '@/lib/game/gateway';

interface HostBinding {
  gameId: string;
  gateway: GameGateway;
  refresh: () => Promise<void>;
  generation: number;
}

interface GameLauncherBinding {
  createRoom: () => Promise<RoomBootstrap>;
  refresh: (gameId: string) => Promise<void>;
  releaseHost: () => void;
}

let binding: HostBinding | null = null;
let launcher: GameLauncherBinding | null = null;
let generation = 0;
let registrationPromise: Promise<void> | null = null;
let registrationController: AbortController | null = null;

export type WebMcpCapabilityIssue =
  | 'browser_required'
  | 'https_required'
  | 'origin_isolation_required'
  | 'api_unavailable';

export type WebMcpCapability =
  | { supported: true }
  | {
      supported: false;
      issue: WebMcpCapabilityIssue;
      reason: string;
      canEnableWithChromeFlag?: boolean;
    };

interface NavigatorWithUserAgentData extends Navigator {
  userAgentData?: {
    brands: Array<{ brand: string; version: string }>;
    mobile: boolean;
  };
}

const emptySchema = { type: 'object', properties: {}, additionalProperties: false } as const;
const checkpointProperties = {
  checkpointId: { type: 'string', description: 'The exact active checkpoint ID returned by get_public_game_state.' },
  expectedRevision: { type: 'integer', minimum: 0, description: 'The current durable game revision.' },
} as const;
const evidenceIdsSchema = {
  type: 'array',
  items: { type: 'integer', minimum: 1 },
  uniqueItems: true,
  description: 'Eligible public evidence IDs from get_public_game_state.',
} as const;
const questionSchema = {
  type: 'object',
  properties: {
    prompt: { type: 'string', minLength: 8, maxLength: 120, description: 'One playful, English, party-safe question.' },
    options: {
      type: 'array',
      items: { type: 'string', minLength: 1, maxLength: 48 },
      description: 'Distinct, mutually exclusive plain-text choices.',
    },
    basisEvidenceIds: evidenceIdsSchema,
  },
  required: ['prompt', 'options'],
  additionalProperties: false,
} as const;

function activeBinding(): HostBinding {
  if (!binding) throw new Error('NOT_AUTHORIZED: No active Host room. On the homepage, call start_game to play.');
  return { ...binding };
}

function setHostBinding(gameId: string, refresh: () => Promise<void>): () => void {
  const leaseGeneration = ++generation;
  binding = { gameId, gateway: gameGateway, refresh, generation: leaseGeneration };
  return () => {
    if (binding?.generation === leaseGeneration) binding = null;
  };
}

function startedGame(publicState: PublicGameSnapshot) {
  return {
    roomCode: publicState.roomCode,
    joinUrl: new URL(`/?room=${publicState.roomCode}`, window.location.origin).href,
    publicState,
    instructions: 'You are the AI Detective. Invite two human players to scan the on-screen QR code, choose stickers, and tap I’m ready on their own phones. Read get_public_game_state and perform its eligibleAgentActions using checkpoint.id and revision, even if phase is still lobby. When no action is eligible, use wait_for_public_event with the current sequence and a timeoutMs of 20000, then read state again. Follow the game until phase is revealed. Write playful English questions suitable for a 13+ party and cite only eligible public evidence. Players control their own answers and secret roles.',
  };
}

function writeSchema(properties: Record<string, unknown>, required: string[]) {
  return {
    type: 'object',
    properties: { ...checkpointProperties, ...properties },
    required: ['checkpointId', 'expectedRevision', ...required],
    additionalProperties: false,
  };
}

function baseInput(input: Record<string, unknown>) {
  return {
    checkpointId: String(input.checkpointId),
    expectedRevision: Number(input.expectedRevision),
  };
}

async function runAction(toolName: string, input: Record<string, unknown>, payload: Record<string, unknown>) {
  const current = activeBinding();
  const base = baseInput(input);
  const result = await current.gateway.agentAction(
    toolName,
    current.gameId,
    base.checkpointId,
    base.expectedRevision,
    payload as never,
  );
  if (result.ok) await current.refresh().catch(() => undefined);
  return result;
}

function questionInput(value: unknown): QuestionDraft {
  const raw = value as Record<string, unknown>;
  return {
    prompt: String(raw.prompt),
    options: Array.isArray(raw.options) ? raw.options.map(String) : [],
    basisEvidenceIds: Array.isArray(raw.basisEvidenceIds) ? raw.basisEvidenceIds.map(Number) : undefined,
  };
}

const toolDefinitions: WebMcpToolDefinition[] = [
  {
    name: 'start_game',
    description: 'Play Can You Be Me? when the user asks to play, for example “Let’s play.” Create a room on this shared screen and act as the AI Detective for two human players joining on phones. Reuses the current Host room if one is already open. No room code or setup prompt is needed.',
    inputSchema: emptySchema,
    async execute(_input, { signal }) {
      signal.throwIfAborted();
      if (binding) return startedGame(await binding.gateway.getPublicState(binding.gameId));
      const current = launcher;
      if (!current) throw new Error('NOT_AUTHORIZED: Open the game homepage on the shared screen to start a game.');
      const bootstrap = await current.createRoom();
      if (launcher !== current) throw new DOMException('The game page was closed.', 'AbortError');
      if (bootstrap.viewerKind !== 'host') throw new Error('NOT_AUTHORIZED: Only the Host can start the Detective.');
      // Bind before returning so the agent can read state immediately, without
      // waiting for React to attach the Host effect after the room appears.
      current.releaseHost = setHostBinding(bootstrap.publicState.gameId, () => current.refresh(bootstrap.publicState.gameId));
      return startedGame(bootstrap.publicState);
    },
    annotations: { readOnlyHint: false, untrustedContentHint: true },
  },
  {
    name: 'get_public_game_state',
    description: 'Read the current public Can You Be Me? game state, checkpoint, eligible Detective action, and citable public evidence. Never returns secret roles or sealed answers. As Detective, perform the eligibleAgentActions using checkpoint.id and revision, even in the lobby. Otherwise wait_for_public_event using sequence, then read again. Finish when phase is revealed.',
    inputSchema: emptySchema,
    async execute() {
      const current = activeBinding();
      return current.gateway.getPublicState(current.gameId);
    },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
  },
  {
    name: 'wait_for_public_event',
    description: 'Wait briefly for the next durable public game event, then return that event or null on timeout. Read get_public_game_state afterward, including after a timeout, to find the next eligible Detective action.',
    inputSchema: {
      type: 'object',
      properties: {
        afterSequence: { type: 'integer', minimum: 0, description: 'Last public sequence already observed.' },
        timeoutMs: { type: 'integer', minimum: 0, maximum: 20000, description: 'Maximum wait in milliseconds.' },
      },
      required: ['afterSequence', 'timeoutMs'],
      additionalProperties: false,
    },
    async execute(input, { signal }) {
      const current = activeBinding();
      return current.gateway.waitForPublicEvent(current.gameId, Number(input.afterSequence), Number(input.timeoutMs), signal);
    },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
  },
  {
    name: 'propose_learn_questions',
    description: 'Publish exactly five varied English getting-to-know-you questions with exactly four choices each. Keep them playful and suitable for a 13+ friends-or-coworkers party.',
    inputSchema: writeSchema({ questions: { type: 'array', minItems: 5, maxItems: 5, items: questionSchema } }, ['questions']),
    execute(input) {
      const questions = Array.isArray(input.questions) ? input.questions.map(questionInput) : [];
      return runAction('propose_learn_questions', input, { questions });
    },
  },
  {
    name: 'propose_contrast_question',
    description: 'Publish one four-choice contrast question that is likely to separate players whose Learn answers were too similar. Base it only on eligible public evidence.',
    inputSchema: writeSchema({ question: questionSchema }, ['question']),
    execute(input) { return runAction('propose_contrast_question', input, { question: questionInput(input.question) }); },
  },
  {
    name: 'propose_player_traits',
    description: 'Publish exactly two concise personality traits for each player, grounded in eligible revealed Learn evidence.',
    inputSchema: writeSchema({
      players: {
        type: 'array', minItems: 2, maxItems: 2,
        items: {
          type: 'object',
          properties: {
            seat: { type: 'string', enum: ['seat_a', 'seat_b'] },
            traits: { type: 'array', minItems: 2, maxItems: 2, items: { type: 'string', minLength: 2, maxLength: 48 } },
            evidenceIds: evidenceIdsSchema,
          },
          required: ['seat', 'traits', 'evidenceIds'], additionalProperties: false,
        },
      },
    }, ['players']),
    execute(input) { return runAction('propose_player_traits', input, { players: input.players }); },
  },
  {
    name: 'propose_challenge_question',
    description: 'Publish one adaptive four-choice Challenge question for the active round, grounded only in eligible public evidence. The server owns the round and roles.',
    inputSchema: writeSchema({ question: questionSchema }, ['question']),
    execute(input) { return runAction('propose_challenge_question', input, { question: questionInput(input.question) }); },
  },
  {
    name: 'place_suspicion',
    description: 'Place the Detective suspicion on one player after a revealed Challenge answer, with a short public explanation and valid public evidence IDs.',
    inputSchema: writeSchema({
      targetSeat: { type: 'string', enum: ['seat_a', 'seat_b'], description: 'Player currently suspected of being the Mirror.' },
      reason: { type: 'string', minLength: 2, maxLength: 140 },
      evidenceIds: evidenceIdsSchema,
    }, ['targetSeat', 'reason', 'evidenceIds']),
    execute(input) {
      return runAction('place_suspicion', input, {
        targetSeat: String(input.targetSeat) as Seat,
        reason: String(input.reason),
        evidenceIds: input.evidenceIds,
      });
    },
  },
  {
    name: 'propose_objection_question',
    description: 'Publish one targeted three-choice follow-up after the shared Objection token is claimed. The server fixes the suspected target; use only eligible Q3 public evidence.',
    inputSchema: writeSchema({ question: questionSchema }, ['question']),
    execute(input) { return runAction('propose_objection_question', input, { question: questionInput(input.question) }); },
  },
  {
    name: 'resolve_objection',
    description: 'After the follow-up is revealed, keep or switch the existing suspicion and explain the decision using valid public evidence.',
    inputSchema: writeSchema({
      decision: { type: 'string', enum: ['keep', 'switch'] },
      reason: { type: 'string', minLength: 2, maxLength: 140 },
      evidenceIds: evidenceIdsSchema,
    }, ['decision', 'reason', 'evidenceIds']),
    execute(input) { return runAction('resolve_objection', input, { decision: input.decision, reason: input.reason, evidenceIds: input.evidenceIds }); },
  },
  {
    name: 'propose_accusation',
    description: 'Commit the final accusation against one player using at least two valid public evidence events. This starts the server-owned reveal countdown without exposing the secret result.',
    inputSchema: writeSchema({
      targetSeat: { type: 'string', enum: ['seat_a', 'seat_b'] },
      evidenceIds: { ...evidenceIdsSchema, minItems: 2 },
      reason: { type: 'string', minLength: 2, maxLength: 180 },
    }, ['targetSeat', 'evidenceIds', 'reason']),
    execute(input) { return runAction('propose_accusation', input, { targetSeat: input.targetSeat, evidenceIds: input.evidenceIds, reason: input.reason }); },
  },
];

export function isDesktopChrome149Plus(currentNavigator: Navigator = navigator): boolean {
  const userAgentData = (currentNavigator as NavigatorWithUserAgentData).userAgentData;
  if (userAgentData) {
    const chrome = userAgentData.brands.find(({ brand }) => brand === 'Google Chrome');
    return !userAgentData.mobile && Number.parseInt(chrome?.version ?? '', 10) >= 149;
  }

  const userAgent = currentNavigator.userAgent;
  if (/Android|Mobile|CriOS\//.test(userAgent) || /(?:Edg|OPR)\//.test(userAgent)) return false;
  const chrome = userAgent.match(/\bChrome\/(\d+)/);
  return Number.parseInt(chrome?.[1] ?? '', 10) >= 149;
}

export function getWebMcpCapability(): WebMcpCapability {
  if (typeof window === 'undefined') return { supported: false, issue: 'browser_required', reason: 'WebMCP requires a browser.' };
  if (!window.isSecureContext && window.location.hostname !== 'localhost') return { supported: false, issue: 'https_required', reason: 'Open this game over HTTPS.' };
  if (window.location.hostname !== 'localhost' && window.originAgentCluster !== true) return { supported: false, issue: 'origin_isolation_required', reason: 'This host is missing origin isolation.' };
  if (typeof document.modelContext?.registerTool !== 'function') {
    return {
      supported: false,
      issue: 'api_unavailable',
      reason: 'WebMCP is unavailable in this browser.',
      canEnableWithChromeFlag: isDesktopChrome149Plus(),
    };
  }
  return { supported: true };
}

export async function ensureWebMcpRegistered(): Promise<void> {
  const capability = getWebMcpCapability();
  if (!capability.supported) throw new Error(capability.reason);
  if (registrationPromise) return registrationPromise;
  registrationController = new AbortController();
  registrationPromise = (async () => {
    try {
      for (const tool of toolDefinitions) {
        await document.modelContext!.registerTool(tool, { signal: registrationController!.signal });
      }
    } catch (error) {
      registrationController?.abort();
      registrationController = null;
      registrationPromise = null;
      throw error;
    }
  })();
  return registrationPromise;
}

export async function bindHostRoom(gameId: string, refresh: () => Promise<void>): Promise<() => void> {
  await ensureWebMcpRegistered();
  return setHostBinding(gameId, refresh);
}

export async function bindGameLauncher(createRoom: () => Promise<RoomBootstrap>, refresh: (gameId: string) => Promise<void>): Promise<() => void> {
  await ensureWebMcpRegistered();
  const current: GameLauncherBinding = { createRoom, refresh, releaseHost: () => {} };
  launcher = current;
  return () => {
    if (launcher === current) launcher = null;
    current.releaseHost();
  };
}

export function webMcpToolNames(): string[] {
  return toolDefinitions.map((tool) => tool.name);
}
