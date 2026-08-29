import type { ExperienceSession } from './types';

export const EXPERIENCE_DB_NAME = 'once-upon';
export const EXPERIENCE_DB_VERSION = 1;
export const EXPERIENCE_STORE_NAME = 'experience-sessions';

export function activeExperienceKey(experienceId: string): string {
  return `active:${experienceId}`;
}

export interface ExperienceStore {
  read(): Promise<ExperienceSession | null>;
  write(session: ExperienceSession): Promise<void>;
  mutate(
    transform: (session: ExperienceSession | null) => ExperienceSession | null,
  ): Promise<ExperienceSession | null>;
  clear(): Promise<void>;
  quarantineCorrupt(): Promise<void>;
}

export interface SessionPersistence {
  read(key: string): Promise<unknown>;
  write(key: string, value: unknown): Promise<void>;
  mutate(key: string, transform: (value: unknown) => unknown): Promise<unknown>;
  delete(key: string): Promise<void>;
  move(fromKey: string, toKey: string): Promise<void>;
}

export class SessionStore implements ExperienceStore {
  private readonly experienceId: string;
  private readonly persistence: SessionPersistence;

  constructor(
    experienceId: string,
    persistence: SessionPersistence = new IndexedDBSessionPersistence(),
  ) {
    this.experienceId = experienceId;
    this.persistence = persistence;
  }

  async read(): Promise<ExperienceSession | null> {
    const value = await this.persistence.read(
      activeExperienceKey(this.experienceId),
    );
    return validateSession(value, this.experienceId);
  }

  async write(session: ExperienceSession): Promise<void> {
    assertExperience(session, this.experienceId);
    await this.persistence.write(
      activeExperienceKey(this.experienceId),
      session,
    );
  }

  async mutate(
    transform: (session: ExperienceSession | null) => ExperienceSession | null,
  ): Promise<ExperienceSession | null> {
    const next = await this.persistence.mutate(
      activeExperienceKey(this.experienceId),
      (value) => {
        const transformed = transform(
          validateSession(value, this.experienceId),
        );
        if (transformed) assertExperience(transformed, this.experienceId);
        return transformed;
      },
    );
    return validateSession(next, this.experienceId);
  }

  async clear(): Promise<void> {
    await this.persistence.delete(activeExperienceKey(this.experienceId));
  }

  async quarantineCorrupt(): Promise<void> {
    await this.persistence.move(
      activeExperienceKey(this.experienceId),
      `corrupt:${this.experienceId}:${Date.now()}`,
    );
  }
}

class IndexedDBSessionPersistence implements SessionPersistence {
  async read(key: string): Promise<unknown> {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(EXPERIENCE_STORE_NAME, 'readonly');
      const request = transaction.objectStore(EXPERIENCE_STORE_NAME).get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(request.error ?? new Error('Could not read the saved story.'));
    });
  }

  async write(key: string, value: unknown): Promise<void> {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(EXPERIENCE_STORE_NAME, 'readwrite');
      transaction.objectStore(EXPERIENCE_STORE_NAME).put(value, key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(transaction.error ?? new Error('Could not save the story.'));
      transaction.onabort = () =>
        reject(
          transaction.error ?? new Error('Saving the story was interrupted.'),
        );
    });
  }

  async mutate(
    key: string,
    transform: (value: unknown) => unknown,
  ): Promise<unknown> {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(EXPERIENCE_STORE_NAME, 'readwrite');
      const objectStore = transaction.objectStore(EXPERIENCE_STORE_NAME);
      const request = objectStore.get(key);
      let next: unknown = null;
      request.onsuccess = () => {
        try {
          next = transform(request.result);
          if (next != null) objectStore.put(next, key);
        } catch (error) {
          transaction.abort();
          reject(error);
        }
      };
      request.onerror = () =>
        reject(request.error ?? new Error('Could not read the saved story.'));
      transaction.oncomplete = () => resolve(next);
      transaction.onerror = () =>
        reject(transaction.error ?? new Error('Could not update the story.'));
      transaction.onabort = () =>
        reject(
          transaction.error ?? new Error('The story update was interrupted.'),
        );
    });
  }

  async delete(key: string): Promise<void> {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(EXPERIENCE_STORE_NAME, 'readwrite');
      transaction.objectStore(EXPERIENCE_STORE_NAME).delete(key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(transaction.error ?? new Error('Could not clear the story.'));
    });
  }

  async move(fromKey: string, toKey: string): Promise<void> {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(EXPERIENCE_STORE_NAME, 'readwrite');
      const objectStore = transaction.objectStore(EXPERIENCE_STORE_NAME);
      const request = objectStore.get(fromKey);
      request.onsuccess = () => {
        if (request.result != null) objectStore.put(request.result, toKey);
        objectStore.delete(fromKey);
      };
      request.onerror = () =>
        reject(
          request.error ?? new Error('Could not preserve the damaged save.'),
        );
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(
          transaction.error ?? new Error('Could not prepare a new story.'),
        );
    });
  }
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(EXPERIENCE_DB_NAME, EXPERIENCE_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(EXPERIENCE_STORE_NAME))
        db.createObjectStore(EXPERIENCE_STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error('IndexedDB is unavailable.'));
  });
}

export function validateSession(
  value: unknown,
  expectedExperienceId: string,
): ExperienceSession | null {
  if (value == null) return null;
  if (typeof value !== 'object')
    throw new Error('SAVE_CORRUPT: The saved story is not an object.');
  const session = value as Partial<ExperienceSession>;
  if (
    session.schemaVersion !== 2 ||
    session.experienceId !== expectedExperienceId ||
    typeof session.storyId !== 'string' ||
    typeof session.sessionId !== 'string' ||
    typeof session.revision !== 'number' ||
    !Array.isArray(session.narrationEntries) ||
    !Array.isArray(session.operationLedger)
  ) {
    throw new Error(
      'SAVE_CORRUPT: The saved story does not match schema version 2.',
    );
  }
  return value as ExperienceSession;
}

function assertExperience(
  session: ExperienceSession,
  expectedExperienceId: string,
): void {
  if (session.experienceId !== expectedExperienceId)
    throw new Error('SAVE_EXPERIENCE_MISMATCH');
}
