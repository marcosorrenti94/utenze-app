import type { BillLine, ElecCategory } from '@/types';

export type SectionKey = ElecCategory | 'iva';

/** Insieme di espressioni regolari usate dal parser. Ogni fornitore può aggiungerne di proprie. */
export interface PatternSet {
  /** Totale da pagare. Il gruppo 1 deve catturare l'importo. */
  total: RegExp[];
  /** kWh totali fatturati. Il gruppo 1 deve catturare il numero. */
  kwh: RegExp[];
  /** Smc totali (gas). Il gruppo 1 deve catturare il numero. */
  smc: RegExp[];
  /** Periodo. Gruppi 1 e 2: data inizio e fine. */
  period: RegExp[];
  /** Intestazioni delle sezioni della bolletta luce. */
  sections: Record<SectionKey, RegExp[]>;
  quotaFissa: RegExp[];
  quotaPotenza: RegExp[];
  quotaEnergia: RegExp[];
  /** Aliquota IVA. Gruppo 1: percentuale. */
  vatRate: RegExp[];
}

export interface ProviderProfile {
  id: string;
  name: string;
  /** Riconosce il fornitore dal testo della bolletta. */
  detect: RegExp;
  /** Pattern aggiuntivi specifici: vengono provati PRIMA di quelli generici. */
  patterns?: Partial<Omit<PatternSet, 'sections'>> & { sections?: Partial<Record<SectionKey, RegExp[]>> };
}

export interface ElectricityParseResult {
  provider: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  month: string | null;
  totalKwh: number | null;
  totalAmount: number | null;
  vatRate: number | null;
  vatAmount: number | null;
  lines: BillLine[];
  /** Nomi dei campi estratti automaticamente */
  extracted: string[];
  ok: boolean;
}

export interface GasParseResult {
  provider: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  month: string | null;
  smc: number | null;
  totalAmount: number | null;
  extracted: string[];
  ok: boolean;
}
