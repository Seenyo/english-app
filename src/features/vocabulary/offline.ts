import type {
  VocabularyKind,
  VocabularyOperation,
  VocabularySession,
} from '@shared/vocabulary/contracts';

export type QueuedVocabularyOperation = {
  id: string;
  userId: string;
  sessionId: string;
  operation: VocabularyOperation;
  position: number;
  queuedAt: number;
};

type CachedVocabularySession = {
  key: string;
  userId: string;
  kind: VocabularyKind;
  session: VocabularySession;
  updatedAt: number;
};

const databaseName = 'everyday-vocabulary';
const databaseVersion = 1;
const operationStore = 'operations';
const sessionStore = 'sessions';
const memoryOperations = new Map<string, QueuedVocabularyOperation>();
const memorySessions = new Map<string, CachedVocabularySession>();

export async function queueVocabularyProgress(
  entry: QueuedVocabularyOperation,
  session: VocabularySession,
): Promise<void> {
  memoryOperations.set(entry.id, entry);
  const sessionEntry: CachedVocabularySession = {
    key: sessionKey(entry.userId, session.kind),
    userId: entry.userId,
    kind: session.kind,
    session,
    updatedAt: Date.now(),
  };
  memorySessions.set(sessionEntry.key, sessionEntry);
  const database = await openDatabase();
  if (!database) return;
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(
        [operationStore, sessionStore],
        'readwrite',
      );
      transaction.objectStore(operationStore).put(entry);
      transaction.objectStore(sessionStore).put(sessionEntry);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } catch {
    // The in-memory entries remain available for this tab's sync loop.
  }
}

export async function readQueuedVocabularyOperations(
  userId: string,
  sessionId: string,
): Promise<QueuedVocabularyOperation[]> {
  const database = await openDatabase();
  const persistedEntries = database
    ? await readAll<QueuedVocabularyOperation>(database, operationStore).catch(
        () => [],
      )
    : [];
  const entries = new Map(
    persistedEntries.map((entry) => [entry.id, entry] as const),
  );
  for (const entry of memoryOperations.values()) entries.set(entry.id, entry);
  return Array.from(entries.values())
    .filter((entry) => entry.userId === userId && entry.sessionId === sessionId)
    .sort((left, right) => left.queuedAt - right.queuedAt);
}

export async function removeQueuedVocabularyOperations(
  operationIds: string[],
): Promise<void> {
  operationIds.forEach((id) => memoryOperations.delete(id));
  const database = await openDatabase();
  if (!database) return;
  await transact(database, operationStore, 'readwrite', (store) => {
    operationIds.forEach((id) => store.delete(id));
  });
}

export async function cacheVocabularySession(
  userId: string,
  session: VocabularySession,
): Promise<void> {
  const entry: CachedVocabularySession = {
    key: sessionKey(userId, session.kind),
    userId,
    kind: session.kind,
    session,
    updatedAt: Date.now(),
  };
  memorySessions.set(entry.key, entry);
  const database = await openDatabase();
  if (!database) return;
  await transact(database, sessionStore, 'readwrite', (store) =>
    store.put(entry),
  ).catch(() => undefined);
}

export async function readCachedVocabularySession(
  userId: string,
  kind: VocabularyKind,
): Promise<VocabularySession | null> {
  const key = sessionKey(userId, kind);
  const database = await openDatabase();
  if (!database) return memorySessions.get(key)?.session ?? null;
  const persistedEntry = await readOne<CachedVocabularySession>(
    database,
    sessionStore,
    key,
  ).catch(() => null);
  const memoryEntry = memorySessions.get(key) ?? null;
  const entry =
    memoryEntry &&
    (!persistedEntry || memoryEntry.updatedAt >= persistedEntry.updatedAt)
      ? memoryEntry
      : persistedEntry;
  return entry?.session ?? null;
}

export async function removeCachedVocabularySession(
  userId: string,
  kind: VocabularyKind,
): Promise<void> {
  const key = sessionKey(userId, kind);
  memorySessions.delete(key);
  const database = await openDatabase();
  if (!database) return;
  await transact(database, sessionStore, 'readwrite', (store) =>
    store.delete(key),
  );
}

function sessionKey(userId: string, kind: VocabularyKind) {
  return `${userId}:${kind}`;
}

let databasePromise: Promise<IDBDatabase | null> | null = null;

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  databasePromise ??= new Promise((resolve) => {
    const request = indexedDB.open(databaseName, databaseVersion);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(operationStore)) {
        database.createObjectStore(operationStore, { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains(sessionStore)) {
        database.createObjectStore(sessionStore, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
  return databasePromise;
}

function transact(
  database: IDBDatabase,
  storeName: string,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, mode);
    action(transaction.objectStore(storeName));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

function readAll<T>(database: IDBDatabase, storeName: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const request = database
      .transaction(storeName, 'readonly')
      .objectStore(storeName)
      .getAll();
    request.onsuccess = () => resolve(request.result as T[]);
    request.onerror = () => reject(request.error);
  });
}

function readOne<T>(
  database: IDBDatabase,
  storeName: string,
  key: string,
): Promise<T | null> {
  return new Promise((resolve, reject) => {
    const request = database
      .transaction(storeName, 'readonly')
      .objectStore(storeName)
      .get(key);
    request.onsuccess = () =>
      resolve((request.result as T | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
}
