import type { Database } from '@/types';

/**
 * Fusione a tre vie (base comune · versione locale · versione remota) del database.
 * Usata quando GitHub rifiuta un salvataggio perché un altro dispositivo ha modificato db.json:
 * invece di scartare le modifiche locali, le si riapplica sopra la versione remota.
 *
 * Granularità: singolo elemento (lettura, bolletta, pagamento del mese) e impostazioni nel loro insieme.
 * - modificato solo in locale → vince il locale
 * - modificato solo in remoto → vince il remoto
 * - modificato in entrambi in modo diverso → conflitto: vince il locale (ultima azione su questo dispositivo)
 *   e il conflitto viene segnalato.
 */

export interface MergeConflict {
  /** Descrizione leggibile dell'elemento in conflitto */
  item: string;
}

export interface MergeResult {
  db: Database;
  conflicts: MergeConflict[];
}

function stable(value: unknown): string {
  return JSON.stringify(value, (_k, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );
}

function same(a: unknown, b: unknown): boolean {
  return stable(a) === stable(b);
}

/** Fusione di un singolo valore (undefined = assente/eliminato). */
function mergeValue<T>(base: T | undefined, local: T | undefined, remote: T | undefined): { value: T | undefined; conflict: boolean } {
  if (same(local, base)) return { value: remote, conflict: false };
  if (same(remote, base) || same(remote, local)) return { value: local, conflict: false };
  return { value: local, conflict: true };
}

function mergeRecords<T>(
  base: Record<string, T>,
  local: Record<string, T>,
  remote: Record<string, T>,
  describe: (key: string, value: T) => string,
  conflicts: MergeConflict[],
): Record<string, T> {
  const out: Record<string, T> = {};
  const keys = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)]);
  for (const key of [...keys].sort()) {
    const { value, conflict } = mergeValue(base[key], local[key], remote[key]);
    if (conflict) conflicts.push({ item: describe(key, (local[key] ?? remote[key] ?? base[key]) as T) });
    if (value !== undefined) out[key] = value;
  }
  return out;
}

function byId<T extends { id: string }>(items: T[]): Record<string, T> {
  return Object.fromEntries(items.map((x) => [x.id, x]));
}

/**
 * Fonde una collezione con id. Dopo la fusione garantisce che ci sia un solo elemento per mese
 * (due dispositivi possono aver inserito la stessa lettura/bolletta con id diversi):
 * in quel caso tiene quello locale e segnala il conflitto.
 */
function mergeCollection<T extends { id: string; month: string }>(
  base: T[],
  local: T[],
  remote: T[],
  label: string,
  uniqueMonth: (x: T) => boolean,
  conflicts: MergeConflict[],
): T[] {
  const merged = Object.values(
    mergeRecords(byId(base), byId(local), byId(remote), (_k, v) => `${label} ${v.month}`, conflicts),
  );
  const localIds = new Set(local.map((x) => x.id));
  const seen = new Map<string, T>();
  const out: T[] = [];
  // Prima gli elementi locali, così in caso di doppione mensile vince il locale
  const ordered = [...merged.filter((x) => localIds.has(x.id)), ...merged.filter((x) => !localIds.has(x.id))];
  for (const item of ordered) {
    if (!uniqueMonth(item)) {
      out.push(item);
      continue;
    }
    if (seen.has(item.month)) {
      conflicts.push({ item: `${label} ${item.month} (inserita su entrambi i dispositivi)` });
      continue;
    }
    seen.set(item.month, item);
    out.push(item);
  }
  // Mantiene l'ordine remoto, con in coda le aggiunte locali, per diff più leggibili
  const order = new Map<string, number>();
  [...remote, ...local].forEach((x, i) => {
    if (!order.has(x.id)) order.set(x.id, i);
  });
  return out.sort((a, b) => (order.get(a.id) ?? Infinity) - (order.get(b.id) ?? Infinity));
}

/**
 * @param base  ultima versione remota su cui si basano le modifiche locali (null se sconosciuta)
 * @param local versione locale con le modifiche non ancora inviate
 * @param remote versione remota attuale
 */
export function mergeDatabases(base: Database | null, local: Database, remote: Database): MergeResult {
  const conflicts: MergeConflict[] = [];
  const b: Pick<Database, 'readings' | 'electricityBills' | 'gasBills' | 'payments'> & { settings?: Database['settings'] } =
    base ?? { readings: [], electricityBills: [], gasBills: [], payments: {} };

  const settings = mergeValue(b.settings, local.settings, remote.settings);
  if (settings.conflict) conflicts.push({ item: 'Impostazioni' });

  const db: Database = {
    ...remote,
    settings: settings.value ?? local.settings,
    readings: mergeCollection(b.readings, local.readings, remote.readings, 'Lettura', (r) => !r.isInitial, conflicts),
    electricityBills: mergeCollection(b.electricityBills, local.electricityBills, remote.electricityBills, 'Bolletta luce', () => true, conflicts),
    gasBills: mergeCollection(b.gasBills, local.gasBills, remote.gasBills, 'Bolletta gas', () => true, conflicts),
    payments: mergeRecords(b.payments, local.payments, remote.payments, (m) => `Pagamento ${m}`, conflicts),
    // Le istantanee vengono ricalcolate da chi salva
    summaries: remote.summaries,
  };
  return { db, conflicts };
}
