import { openDB, type IDBPDatabase } from 'idb';
import type { Database } from '@/types';

/** Cache locale in IndexedDB: avvio istantaneo e uso offline. */
export interface CachedState {
  connectionKey: string;
  db: Database;
  /** SHA dell'ultima versione remota conosciuta */
  sha: string | null;
  /** true se ci sono modifiche locali non ancora inviate a GitHub */
  dirty: boolean;
  /** Ultima versione remota su cui si basano le modifiche locali (per la fusione in caso di conflitto) */
  base?: Database | null;
  savedAt: string;
}

const DB_NAME = 'utenze-cache';
const STORE = 'state';
let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      },
    });
  }
  return dbPromise;
}

export async function readCache(connectionKey: string): Promise<CachedState | null> {
  try {
    const db = await getDb();
    const value = (await db.get(STORE, connectionKey)) as CachedState | undefined;
    return value ?? null;
  } catch {
    return null;
  }
}

export async function writeCache(state: CachedState): Promise<void> {
  try {
    const db = await getDb();
    await db.put(STORE, state, state.connectionKey);
  } catch {
    /* IndexedDB non disponibile (es. navigazione privata): si continua senza cache */
  }
}

export async function clearCache(): Promise<void> {
  try {
    const db = await getDb();
    await db.clear(STORE);
  } catch {
    /* ignora */
  }
}
