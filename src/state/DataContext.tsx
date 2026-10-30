import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import type { Database } from '@/types';
import { emptyDatabase } from '@/lib/calc/defaults';
import { buildSnapshots } from '@/lib/calc/summary';
import { AuthError, ConflictError, GitHubStore } from '@/lib/storage/github';
import { readCache, writeCache } from '@/lib/storage/cache';
import { mergeDatabases } from '@/lib/storage/merge';
import { connectionKey, type Connection } from '@/lib/storage/connection';

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'offline' | 'error';

interface DataContextValue {
  connection: Connection;
  db: Database | null;
  loading: boolean;
  status: SyncStatus;
  pending: boolean;
  lastSync: string | null;
  error: string | null;
  /** Applica una modifica, la salva in cache e la sincronizza con GitHub. */
  update: (mutator: (draft: Database) => Database | void, successMessage?: string) => Promise<boolean>;
  syncNow: () => Promise<void>;
  uploadFile: (path: string, data: ArrayBuffer, message: string) => Promise<boolean>;
  getFile: (path: string) => Promise<Blob>;
  deleteFile: (path: string) => Promise<void>;
  disconnect: () => void;
}

const Ctx = createContext<DataContextValue | null>(null);

const CONFLICT_MSG =
  'Un altro dispositivo ha modificato gli stessi elementi: ho unito i dati mantenendo la versione di questo dispositivo per';

function finalize(db: Database): Database {
  return { ...db, summaries: buildSnapshots(db), updatedAt: new Date().toISOString() };
}

export function DataProvider({
  connection,
  onDisconnect,
  children,
}: {
  connection: Connection;
  onDisconnect: () => void;
  children: ReactNode;
}) {
  const key = connectionKey(connection);
  const store = useMemo(() => new GitHubStore(connection), [connection]);

  const [db, setDb] = useState<Database | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<SyncStatus>('idle');
  const [pending, setPending] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dbRef = useRef<Database | null>(null);
  const shaRef = useRef<string | null>(null);
  const dirtyRef = useRef(false);
  /** Ultima versione remota conosciuta: base comune per la fusione a tre vie */
  const baseRef = useRef<Database | null>(null);
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());

  const commitLocal = useCallback(
    async (next: Database, sha: string | null, dirty: boolean, base: Database | null) => {
      dbRef.current = next;
      shaRef.current = sha;
      dirtyRef.current = dirty;
      baseRef.current = base;
      setDb(next);
      setPending(dirty);
      await writeCache({ connectionKey: key, db: next, sha, dirty, base, savedAt: new Date().toISOString() });
    },
    [key],
  );

  const markSynced = useCallback(() => {
    setStatus('synced');
    setError(null);
    setLastSync(new Date().toISOString());
  }, []);

  const handleError = useCallback((e: unknown) => {
    if (!navigator.onLine) {
      setStatus('offline');
      return;
    }
    const msg = e instanceof AuthError ? 'Token non valido o scaduto: aggiorna la connessione.' : e instanceof Error ? e.message : String(e);
    setStatus('error');
    setError(msg);
    toast.error('Errore di sincronizzazione', { description: msg });
  }, []);

  /** Scarica la versione remota (o crea il database se non esiste). */
  const pull = useCallback(async () => {
    const remote = await store.readDatabase();
    if (remote) {
      await commitLocal(remote.db, remote.sha, false, remote.db);
    } else {
      const initial = finalize(dbRef.current ?? emptyDatabase());
      const sha = await store.writeDatabase(initial, null);
      await commitLocal(initial, sha, false, initial);
    }
  }, [store, commitLocal]);

  /** Invia le modifiche locali usando lo SHA noto. */
  const push = useCallback(async () => {
    if (!dbRef.current) return;
    const sha = await store.writeDatabase(dbRef.current, shaRef.current);
    await commitLocal(dbRef.current, sha, false, dbRef.current);
  }, [store, commitLocal]);

  /**
   * Invia le modifiche locali. Se un altro dispositivo ha salvato nel frattempo (conflitto di SHA),
   * scarica la versione remota, ci fonde sopra le modifiche locali e riprova: nessuna modifica va persa.
   * Restituisce null se non è servita alcuna fusione, altrimenti gli elementi modificati in modo diverso
   * su entrambi i dispositivi (risolti a favore del locale).
   */
  const pushWithMerge = useCallback(async (): Promise<string[] | null> => {
    const conflicts = new Set<string>();
    let merged = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await push();
        return merged ? [...conflicts] : null;
      } catch (e) {
        merged = true;
        if (!(e instanceof ConflictError) || !dbRef.current) throw e;
        const remote = await store.readDatabase();
        if (!remote) {
          // Il file remoto non esiste più: verrà ricreato con i dati locali
          await commitLocal(dbRef.current, null, true, null);
          continue;
        }
        const result = mergeDatabases(baseRef.current, dbRef.current, remote.db);
        result.conflicts.forEach((c) => conflicts.add(c.item));
        await commitLocal(finalize(result.db), remote.sha, true, remote.db);
      }
    }
    throw new ConflictError();
  }, [push, store, commitLocal]);

  const notifyMerge = useCallback((conflicts: string[] | null) => {
    if (!conflicts) return;
    if (!conflicts.length) {
      toast.info('Dati uniti con le modifiche di un altro dispositivo');
      return;
    }
    toast.warning('Modifiche in conflitto', {
      description: `${CONFLICT_MSG} ${conflicts.join(', ')}.`,
      duration: 15_000,
    });
  }, []);

  const enqueue = useCallback(<T,>(task: () => Promise<T>): Promise<T> => {
    const run = queueRef.current.then(task, task);
    queueRef.current = run.catch(() => undefined);
    return run;
  }, []);

  const sync = useCallback(
    () =>
      enqueue(async () => {
        if (!navigator.onLine) {
          setStatus('offline');
          return;
        }
        setStatus('syncing');
        try {
          if (dirtyRef.current && dbRef.current) {
            const conflicts = await pushWithMerge();
            toast.success('Modifiche offline sincronizzate');
            notifyMerge(conflicts);
          } else {
            await pull();
          }
          markSynced();
        } catch (e) {
          handleError(e);
        }
      }),
    [enqueue, pushWithMerge, notifyMerge, pull, markSynced, handleError],
  );

  // Avvio: cache locale (istantanea) → sincronizzazione con GitHub
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cached = await readCache(key);
      if (cancelled) return;
      if (cached) {
        dbRef.current = cached.db;
        shaRef.current = cached.sha;
        dirtyRef.current = cached.dirty;
        // Cache di versioni precedenti senza base: la fusione tratterà tutto come modificato in locale
        baseRef.current = cached.base ?? (cached.dirty ? null : cached.db);
        setDb(cached.db);
        setPending(cached.dirty);
        setLoading(false);
      }
      await sync();
      if (!cancelled) {
        if (!dbRef.current) {
          // Offline al primo avvio senza cache: si parte da un database vuoto locale
          await commitLocal(emptyDatabase(), null, true, null);
        }
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key]);

  useEffect(() => {
    const onOnline = () => void sync();
    const onOffline = () => setStatus('offline');
    const onVisible = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) void sync();
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [sync]);

  const update = useCallback<DataContextValue['update']>(
    (mutator, successMessage) =>
      enqueue(async () => {
        const base = dbRef.current ?? emptyDatabase();
        const draft = structuredClone(base);
        const result = mutator(draft) ?? draft;
        const next = finalize(result);
        await commitLocal(next, shaRef.current, true, baseRef.current);

        if (!navigator.onLine) {
          setStatus('offline');
          toast.info('Salvato sul dispositivo', { description: 'Verrà sincronizzato appena torni online.' });
          return true;
        }
        setStatus('syncing');
        try {
          const conflicts = await pushWithMerge();
          markSynced();
          if (successMessage) toast.success(successMessage);
          notifyMerge(conflicts);
          return true;
        } catch (e) {
          // La modifica resta salvata sul dispositivo (dirty) e verrà reinviata alla prossima sincronizzazione
          handleError(e);
          return false;
        }
      }),
    [enqueue, commitLocal, pushWithMerge, notifyMerge, markSynced, handleError],
  );

  const uploadFile = useCallback(
    async (path: string, data: ArrayBuffer, message: string) => {
      if (!navigator.onLine) {
        toast.error('Sei offline', { description: 'Il file non è stato caricato. Riprova quando sei online.' });
        return false;
      }
      try {
        await store.putFile(path, data, message);
        return true;
      } catch (e) {
        handleError(e);
        return false;
      }
    },
    [store, handleError],
  );

  const getFile = useCallback((path: string) => store.getFile(path), [store]);
  const deleteFile = useCallback(
    async (path: string) => {
      try {
        await store.deleteFile(path, `Eliminazione ${path}`);
      } catch (e) {
        handleError(e);
      }
    },
    [store, handleError],
  );

  const value: DataContextValue = {
    connection,
    db,
    loading,
    status,
    pending,
    lastSync,
    error,
    update,
    syncNow: sync,
    uploadFile,
    getFile,
    deleteFile,
    disconnect: onDisconnect,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useData(): DataContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useData deve essere usato dentro DataProvider');
  return ctx;
}

/** Variante per le pagine: il database è garantito dopo il caricamento. */
export function useDb(): Database {
  const { db } = useData();
  return db ?? emptyDatabase();
}
