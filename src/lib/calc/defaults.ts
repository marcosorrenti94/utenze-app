import type {
  AllocationRule,
  AllocationSettings,
  Database,
  ElecCategory,
  LineComponent,
  Settings,
} from '@/types';

export const CATEGORIES: ElecCategory[] = ['energia', 'trasporto', 'oneri', 'accise', 'rai', 'altre'];
export const COMPONENTS: LineComponent[] = ['consumo', 'fisso', 'potenza'];

export const CATEGORY_LABELS: Record<ElecCategory, string> = {
  energia: 'Materia energia',
  trasporto: 'Trasporto e gestione contatore',
  oneri: 'Oneri di sistema',
  accise: 'Accise e imposte',
  rai: 'Canone RAI',
  altre: 'Altre partite / conguagli',
};

export const COMPONENT_LABELS: Record<LineComponent, string> = {
  consumo: 'Quota consumo',
  fisso: 'Quota fissa',
  potenza: 'Quota potenza',
};

const r = (method: AllocationRule['method'], tenantPercent = 50): AllocationRule => ({ method, tenantPercent });

/**
 * Regole predefinite:
 * - le quote a consumo di energia, oneri e accise si dividono in proporzione ai kWh;
 * - trasporto e gestione contatore sempre al 50% (anche la quota a consumo);
 * - quote fisse e potenza di qualsiasi voce al 50%;
 * - canone RAI e altre partite al 50%.
 */
export function defaultAllocation(): AllocationSettings {
  return {
    energia: { consumo: r('kwh'), fisso: r('half'), potenza: r('half') },
    trasporto: { consumo: r('half'), fisso: r('half'), potenza: r('half') },
    oneri: { consumo: r('kwh'), fisso: r('half'), potenza: r('half') },
    accise: { consumo: r('kwh'), fisso: r('half'), potenza: r('half') },
    rai: { consumo: r('half'), fisso: r('half'), potenza: r('half') },
    altre: { consumo: r('half'), fisso: r('half'), potenza: r('half') },
  };
}

export function defaultSettings(): Settings {
  return {
    tenantName: 'Inquilino',
    ownerName: 'Proprietario',
    allocation: defaultAllocation(),
    vatMode: 'rate',
    gasTenantPercent: 35,
    anomalyThresholdPercent: 50,
  };
}

export function emptyDatabase(): Database {
  return {
    schemaVersion: 1,
    settings: defaultSettings(),
    readings: [],
    electricityBills: [],
    gasBills: [],
    payments: {},
    summaries: {},
    updatedAt: new Date().toISOString(),
  };
}

/** Completa un database importato/remoto con i valori mancanti. */
export function normalizeDatabase(input: unknown): Database {
  const base = emptyDatabase();
  if (!input || typeof input !== 'object') return base;
  const db = input as Partial<Database>;
  const settings: Settings = { ...base.settings, ...(db.settings ?? {}) };
  const allocation = defaultAllocation();
  for (const cat of CATEGORIES) {
    for (const comp of COMPONENTS) {
      const rule = db.settings?.allocation?.[cat]?.[comp];
      if (rule && typeof rule.method === 'string') {
        allocation[cat][comp] = {
          method: rule.method,
          tenantPercent: Number.isFinite(rule.tenantPercent) ? rule.tenantPercent : 50,
        };
      }
    }
  }
  settings.allocation = allocation;
  return {
    schemaVersion: 1,
    settings,
    readings: Array.isArray(db.readings) ? db.readings : [],
    electricityBills: Array.isArray(db.electricityBills) ? db.electricityBills : [],
    gasBills: Array.isArray(db.gasBills) ? db.gasBills : [],
    payments: db.payments && typeof db.payments === 'object' ? db.payments : {},
    summaries: db.summaries && typeof db.summaries === 'object' ? db.summaries : {},
    updatedAt: typeof db.updatedAt === 'string' ? db.updatedAt : base.updatedAt,
  };
}

export function isDatabaseLike(input: unknown): boolean {
  if (!input || typeof input !== 'object') return false;
  const db = input as Record<string, unknown>;
  return Array.isArray(db.readings) || Array.isArray(db.electricityBills) || Array.isArray(db.gasBills);
}
