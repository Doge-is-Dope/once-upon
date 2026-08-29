import type { GameSession } from './types';

const DB_NAME = 'the-last-manuscript';
const DB_VERSION = 1;
const STORE_NAME = 'sessions';
const ACTIVE_KEY = 'active';

export class SessionStore {
  async read(): Promise<GameSession | null> {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const request = transaction.objectStore(STORE_NAME).get(ACTIVE_KEY);
      request.onsuccess = () => {
        try {
          resolve(validateSession(request.result));
        } catch (error) {
          reject(error);
        }
      };
      request.onerror = () =>
        reject(
          request.error ?? new Error('Could not read the saved manuscript.'),
        );
    });
  }

  async write(session: GameSession): Promise<void> {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put(session, ACTIVE_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(
          transaction.error ?? new Error('Could not save the manuscript.'),
        );
      transaction.onabort = () =>
        reject(
          transaction.error ??
            new Error('Saving the manuscript was interrupted.'),
        );
    });
  }

  async mutate(
    transform: (session: GameSession | null) => GameSession | null,
  ): Promise<GameSession | null> {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const objectStore = transaction.objectStore(STORE_NAME);
      const request = objectStore.get(ACTIVE_KEY);
      let next: GameSession | null = null;
      request.onsuccess = () => {
        try {
          next = transform(validateSession(request.result));
          if (next) objectStore.put(next, ACTIVE_KEY);
        } catch (error) {
          transaction.abort();
          reject(error);
        }
      };
      request.onerror = () =>
        reject(
          request.error ?? new Error('Could not read the saved manuscript.'),
        );
      transaction.oncomplete = () => resolve(next);
      transaction.onerror = () =>
        reject(
          transaction.error ?? new Error('Could not update the manuscript.'),
        );
      transaction.onabort = () =>
        reject(
          transaction.error ??
            new Error('The manuscript update was interrupted.'),
        );
    });
  }

  async clear(): Promise<void> {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).delete(ACTIVE_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(
          transaction.error ?? new Error('Could not clear the manuscript.'),
        );
    });
  }

  async quarantineCorrupt(): Promise<void> {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const objectStore = transaction.objectStore(STORE_NAME);
      const request = objectStore.get(ACTIVE_KEY);
      request.onsuccess = () => {
        if (request.result != null) {
          objectStore.put(request.result, `corrupt_${Date.now()}`);
        }
        objectStore.delete(ACTIVE_KEY);
      };
      request.onerror = () =>
        reject(
          request.error ??
            new Error('Could not preserve the damaged manuscript.'),
        );
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(
          transaction.error ?? new Error('Could not prepare a new manuscript.'),
        );
    });
  }
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME))
        db.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error('IndexedDB is unavailable.'));
  });
}

function validateSession(value: unknown): GameSession | null {
  if (value == null) return null;
  if (typeof value !== 'object')
    throw new Error('SAVE_CORRUPT: The saved manuscript is not an object.');
  const session = value as Partial<GameSession>;
  if (
    session.schemaVersion !== 1 ||
    typeof session.sessionId !== 'string' ||
    typeof session.revision !== 'number' ||
    !Array.isArray(session.manuscript) ||
    !Array.isArray(session.operationLedger)
  ) {
    throw new Error(
      'SAVE_CORRUPT: The saved manuscript does not match schema version 1.',
    );
  }
  return value as GameSession;
}
