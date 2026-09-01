import {
  beginStoryTurn,
  commitStoryChapter,
  createExperienceSession,
  getStateResponse,
  invokeStoryInteraction,
  toStoryState,
} from './engine';
import type {
  BeginStoryTurnInput,
  CommitStoryChapterInput,
  ExperienceDefinition,
  ExperienceSession,
  InvokeInteractionInput,
  ToolResponse,
} from './types';

type Listener = (session: ExperienceSession) => void;

export class ExperienceController {
  readonly definition: ExperienceDefinition;
  private session: ExperienceSession;
  private listeners = new Set<Listener>();
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    definition: ExperienceDefinition,
    initialSession: ExperienceSession = createExperienceSession(definition),
  ) {
    this.definition = definition;
    this.session = structuredClone(initialSession);
  }

  getSnapshot(): ExperienceSession {
    return this.session;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async getState(): Promise<ToolResponse> {
    return getStateResponse(this.definition, this.session);
  }

  async beginStoryTurn(
    input: BeginStoryTurnInput,
    signal?: AbortSignal,
  ): Promise<ToolResponse> {
    return this.mutate(
      (session) => beginStoryTurn(this.definition, session, input),
      signal,
    );
  }

  async invokeInteraction(
    input: InvokeInteractionInput,
    signal?: AbortSignal,
  ): Promise<ToolResponse> {
    return this.mutate(
      (session) => invokeStoryInteraction(this.definition, session, input),
      signal,
    );
  }

  async commitStoryChapter(
    input: CommitStoryChapterInput,
    signal?: AbortSignal,
  ): Promise<ToolResponse> {
    return this.mutate(
      (session) => commitStoryChapter(this.definition, session, input),
      signal,
    );
  }

  invalidInput(message: string): ToolResponse {
    return {
      ok: false,
      code: 'INVALID_INPUT',
      message,
      state: toStoryState(this.definition, this.session),
    };
  }

  private mutate(
    operation: (session: ExperienceSession) => {
      session: ExperienceSession;
      response: ToolResponse;
    },
    signal?: AbortSignal,
  ): Promise<ToolResponse> {
    return this.serial(() => {
      throwIfAborted(signal);
      // The engine transform is synchronous. This is the commit point:
      // cancellation can stop queued work, never a committed mutation.
      const outcome = operation(this.session);
      this.session = outcome.session;
      this.emit();
      return outcome.response;
    });
  }

  private emit(): void {
    for (const listener of this.listeners) listener(this.session);
  }

  private serial<T>(task: () => T | Promise<T>): Promise<T> {
    const result = this.queue.then(task, task);
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  throw new DOMException('Cancelled before the commit point.', 'AbortError');
}
