/** Categorie delle voci della bolletta luce (IVA gestita a parte). */
export type ElecCategory = 'energia' | 'trasporto' | 'oneri' | 'accise' | 'rai' | 'altre';

/** Componente di una voce: a consumo (€/kWh), fissa (€/mese) o potenza (€/kW). */
export type LineComponent = 'consumo' | 'fisso' | 'potenza';

/** Metodo di ripartizione di una componente. */
export type AllocationMethod = 'kwh' | 'half' | 'custom' | 'excluded';

export interface AllocationRule {
  method: AllocationMethod;
  /** Percentuale a carico dell'inquilino, usata solo con method = 'custom'. */
  tenantPercent: number;
}

export type AllocationSettings = Record<ElecCategory, Record<LineComponent, AllocationRule>>;

/**
 * - 'rate': l'aliquota IVA della bolletta viene applicata all'imponibile di ciascuno.
 * - 'proportional': l'IVA in bolletta viene divisa in proporzione all'imponibile di ciascuno.
 */
export type VatMode = 'rate' | 'proportional';

export interface Settings {
  tenantName: string;
  ownerName: string;
  allocation: AllocationSettings;
  vatMode: VatMode;
  /** Percentuale della bolletta gas a carico dell'inquilino (default 35). */
  gasTenantPercent: number;
  /** Soglia (in %) oltre la media per segnalare un consumo anomalo (default 50). */
  anomalyThresholdPercent: number;
}

export interface Reading {
  id: string;
  /** Mese di riferimento AAAA-MM */
  month: string;
  /** Data della lettura AAAA-MM-GG */
  date: string;
  /** Valore cumulativo del contascatti in kWh */
  value: number;
  /** Lettura iniziale di partenza (non genera consumo) */
  isInitial: boolean;
  /** Percorso della foto nel repo dati (facoltativa, solo come prova) */
  photoPath?: string;
  note?: string;
}

export interface BillLine {
  id: string;
  category: ElecCategory;
  label: string;
  /** Quota a consumo (€) */
  consumo: number;
  /** Quota fissa (€) */
  fisso: number;
  /** Quota potenza (€) */
  potenza: number;
  /** true se la voce non è soggetta a IVA (es. canone RAI) */
  vatExempt: boolean;
}

export interface ElectricityBill {
  id: string;
  /** Mese di riferimento AAAA-MM */
  month: string;
  provider?: string;
  periodStart?: string;
  periodEnd?: string;
  /** kWh totali fatturati in bolletta */
  totalKwh: number;
  /** Totale bolletta (€) */
  totalAmount: number;
  /** Aliquota IVA (%) */
  vatRate: number;
  /** Importo IVA in bolletta (€) */
  vatAmount: number;
  lines: BillLine[];
  pdfPath?: string;
  /** Campi compilati automaticamente dal parser (da verificare) */
  autoExtracted?: string[];
  createdAt: string;
  updatedAt?: string;
}

export interface GasBill {
  id: string;
  month: string;
  provider?: string;
  periodStart?: string;
  periodEnd?: string;
  smc: number;
  totalAmount: number;
  pdfPath?: string;
  autoExtracted?: string[];
  createdAt: string;
  updatedAt?: string;
}

/** Le sole impostazioni che influenzano gli importi. */
export type CalcSettings = Pick<Settings, 'allocation' | 'vatMode' | 'gasTenantPercent'>;

export interface Payment {
  paid: boolean;
  /** Data del pagamento AAAA-MM-GG */
  date?: string;
  note?: string;
  /**
   * Regole di calcolo in vigore quando il mese è stato segnato come pagato.
   * Se presenti, il mese viene calcolato con queste e non con le impostazioni correnti.
   */
  calcSettings?: CalcSettings;
}

/** Istantanea del calcolo salvata in db.json per consultazione e storico. */
export interface MonthSnapshot {
  month: string;
  tenantKwh: number | null;
  billKwh: number | null;
  electricityTenant: number;
  electricityOwner: number;
  gasTenant: number;
  gasOwner: number;
  total: number;
  computedAt: string;
}

export interface Database {
  schemaVersion: 3;
  settings: Settings;
  readings: Reading[];
  electricityBills: ElectricityBill[];
  gasBills: GasBill[];
  payments: Record<string, Payment>;
  summaries: Record<string, MonthSnapshot>;
  updatedAt: string;
}
