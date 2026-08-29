import {
  createSession,
  defaultEngineContext,
  getStateResponse,
  resolveAction,
  writeManuscript,
} from './engine';
import { SessionStore } from './store';
import type {
  ActionInput,
  AttributeId,
  GameSession,
  ManuscriptInput,
  ToolResponse,
} from './types';

type Listener = (session: GameSession | null) => void;
type FaultListener = (message: string) => void;

export class GameController {
  private readonly store: SessionStore;
  private session: GameSession | null = null;
  private listeners = new Set<Listener>();
  private faultListeners = new Set<FaultListener>();
  private queue: Promise<unknown> = Promise.resolve();

  constructor(store = new SessionStore()) {
    this.store = store;
  }

  async initialize(): Promise<GameSession | null> {
    this.session = await this.store.read();
    this.emit();
    return this.session;
  }

  getSnapshot(): GameSession | null {
    return this.session;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  subscribeToFaults(listener: FaultListener): () => void {
    this.faultListeners.add(listener);
    return () => this.faultListeners.delete(listener);
  }

  async begin(name: string, specialty: AttributeId): Promise<GameSession> {
    return this.serial(async () => {
      const session = createSession(name, specialty);
      await this.store.write(session);
      this.session = session;
      this.emit();
      return session;
    });
  }

  async getState(): Promise<ToolResponse> {
    if (!this.session) this.session = await this.store.read();
    return getStateResponse(this.session);
  }

  async performAction(
    input: ActionInput,
    forcedDie?: number,
  ): Promise<ToolResponse> {
    return this.serial(async () => {
      let response: ToolResponse = {
        ok: false,
        code: 'NO_ACTIVE_SESSION',
        message: 'Begin the story first.',
      };
      try {
        const next = await this.store.mutate((saved) => {
          if (!saved) return null;
          const die = forcedDie ?? secureD20;
          const outcome = resolveAction(saved, input, die, defaultEngineContext);
          response = outcome.response;
          return outcome.session;
        });
        this.session = next;
      } catch (error) {
        this.emitFault('The last turn could not be saved to this device.');
        throw error;
      }
      this.emit();
      return this.session ? response : getStateResponse(null);
    });
  }

  async writeManuscript(input: ManuscriptInput): Promise<ToolResponse> {
    return this.serial(async () => {
      let response: ToolResponse = {
        ok: false,
        code: 'NO_ACTIVE_SESSION',
        message: 'Begin the story first.',
      };
      try {
        const next = await this.store.mutate((saved) => {
          if (!saved) return null;
          const outcome = writeManuscript(saved, input, defaultEngineContext);
          response = outcome.response;
          return outcome.session;
        });
        this.session = next;
      } catch (error) {
        this.emitFault('The last turn could not be saved to this device.');
        throw error;
      }
      this.emit();
      return this.session ? response : getStateResponse(null);
    });
  }

  async restart(): Promise<void> {
    await this.serial(async () => {
      try {
        await this.store.clear();
      } catch (error) {
        this.emitFault('The old manuscript could not be cleared from this device.');
        throw error;
      }
      this.session = null;
      this.emit();
    });
  }

  async recoverCorruptSave(): Promise<void> {
    await this.store.quarantineCorrupt();
    this.session = null;
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener(this.session);
  }

  private emitFault(message: string): void {
    for (const listener of this.faultListeners) listener(message);
  }

  private serial<T>(task: () => Promise<T>): Promise<T> {
    const result = this.queue.then(task, task);
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

function secureD20(): number {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return (values[0] % 20) + 1;
}

export const gameController = new GameController();
