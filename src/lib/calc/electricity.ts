import type {
  AllocationMethod,
  AllocationSettings,
  ElecCategory,
  ElectricityBill,
  LineComponent,
  VatMode,
} from '@/types';
import { CATEGORY_LABELS, COMPONENTS, COMPONENT_LABELS } from './defaults';
import { round2, safeNumber } from './round';

export type WarningLevel = 'error' | 'warning' | 'info';

export interface CalcWarning {
  level: WarningLevel;
  code: string;
  message: string;
}

export interface CalcRow {
  lineId: string;
  category: ElecCategory;
  label: string;
  component: LineComponent;
  amount: number;
  method: AllocationMethod;
  /** Descrizione leggibile del criterio applicato */
  criterion: string;
  /** Frazione dell'importo a carico dell'inquilino (0..1) */
  tenantRatio: number;
  tenant: number;
  owner: number;
  taxable: boolean;
}

export interface ElectricityInput {
  bill: ElectricityBill;
  tenantKwh: number;
  allocation: AllocationSettings;
  vatMode: VatMode;
}

export interface ElectricityResult {
  rows: CalcRow[];
  billKwh: number;
  tenantKwh: number;
  ownerKwh: number;
  /** Somma delle voci ripartite in proporzione ai kWh */
  kwhPoolAmount: number;
  /** Costo unitario = somma voci a consumo / kWh bolletta (null se kWh = 0) */
  unitCost: number | null;
  /** Quota inquilino del pool a consumo = kWh inquilino × costo unitario */
  tenantKwhCost: number;
  taxableTotal: number;
  tenantTaxable: number;
  ownerTaxable: number;
  exemptTotal: number;
  tenantExempt: number;
  ownerExempt: number;
  vat: {
    mode: VatMode;
    rate: number;
    amount: number;
    tenant: number;
    owner: number;
  };
  /** Somma voci + IVA calcolata dalle voci inserite */
  computedTotal: number;
  /** Totale dichiarato in bolletta */
  billTotal: number;
  /** Totale dichiarato − somma calcolata */
  billDifference: number;
  /** Quota inquilino non arrotondata */
  tenantRaw: number;
  /** Quota inquilino arrotondata al centesimo (solo il totale finale viene arrotondato) */
  tenantTotal: number;
  /** Quota proprietario = totale − quota inquilino */
  ownerTotal: number;
  warnings: CalcWarning[];
}

function describe(method: AllocationMethod, tenantPercent: number, tenantKwh: number, billKwh: number): string {
  switch (method) {
    case 'kwh':
      return billKwh > 0
        ? `Proporzionale ai kWh (${fmt(tenantKwh)} / ${fmt(billKwh)} kWh)`
        : 'Proporzionale ai kWh (kWh bolletta mancanti)';
    case 'half':
      return '50 / 50';
    case 'custom':
      return `Personalizzata (${fmt(tenantPercent)}% inquilino)`;
    case 'excluded':
      return 'Esclusa (a carico del proprietario)';
  }
}

function fmt(n: number): string {
  return new Intl.NumberFormat('it-IT', { maximumFractionDigits: 2 }).format(n);
}

function ratioFor(method: AllocationMethod, tenantPercent: number, tenantKwh: number, billKwh: number): number {
  switch (method) {
    case 'kwh':
      // Mai oltre il 100%: l'inquilino non può pagare più dell'intera voce
      return billKwh > 0 ? Math.min(tenantKwh / billKwh, 1) : 0;
    case 'half':
      return 0.5;
    case 'custom':
      return Math.min(Math.max(safeNumber(tenantPercent), 0), 100) / 100;
    case 'excluded':
      return 0;
  }
}

/**
 * Calcola la quota luce dell'inquilino. Funzione pura: nessun effetto collaterale.
 * Gli importi intermedi NON vengono arrotondati; si arrotonda solo il totale finale.
 */
export function computeElectricity(input: ElectricityInput): ElectricityResult {
  const { bill, allocation, vatMode } = input;
  const warnings: CalcWarning[] = [];
  const billKwh = safeNumber(bill.totalKwh);
  const tenantKwh = Math.max(0, safeNumber(input.tenantKwh));

  if (billKwh <= 0) {
    warnings.push({
      level: 'error',
      code: 'missing-bill-kwh',
      message: 'kWh totali della bolletta mancanti: le voci a consumo non possono essere ripartite.',
    });
  }
  if (billKwh > 0 && tenantKwh > billKwh) {
    warnings.push({
      level: 'error',
      code: 'tenant-exceeds-bill',
      message: `I kWh dell'inquilino (${fmt(tenantKwh)}) superano i kWh totali della bolletta (${fmt(billKwh)}): le voci a consumo sono state attribuite al 100% all'inquilino. Verifica la lettura.`,
    });
  }
  if (!bill.lines.length) {
    warnings.push({ level: 'warning', code: 'no-lines', message: 'La bolletta non contiene voci di dettaglio.' });
  }

  const rows: CalcRow[] = [];
  for (const line of bill.lines) {
    for (const component of COMPONENTS) {
      const amount = safeNumber(line[component]);
      if (amount === 0) continue;
      const rule = allocation[line.category]?.[component] ?? { method: 'half' as const, tenantPercent: 50 };
      const tenantRatio = ratioFor(rule.method, rule.tenantPercent, tenantKwh, billKwh);
      const tenant = amount * tenantRatio;
      rows.push({
        lineId: line.id,
        category: line.category,
        label: `${line.label || CATEGORY_LABELS[line.category]} · ${COMPONENT_LABELS[component]}`,
        component,
        amount,
        method: rule.method,
        criterion: describe(rule.method, rule.tenantPercent, tenantKwh, billKwh),
        tenantRatio,
        tenant,
        owner: amount - tenant,
        taxable: !line.vatExempt,
      });
    }
  }

  const kwhRows = rows.filter((r) => r.method === 'kwh');
  const kwhPoolAmount = kwhRows.reduce((s, r) => s + r.amount, 0);
  const unitCost = billKwh > 0 ? kwhPoolAmount / billKwh : null;
  const tenantKwhCost = unitCost === null ? 0 : Math.min(tenantKwh, billKwh) * unitCost;

  const taxableRows = rows.filter((r) => r.taxable);
  const exemptRows = rows.filter((r) => !r.taxable);
  const taxableTotal = taxableRows.reduce((s, r) => s + r.amount, 0);
  const tenantTaxable = taxableRows.reduce((s, r) => s + r.tenant, 0);
  const ownerTaxable = taxableTotal - tenantTaxable;
  const exemptTotal = exemptRows.reduce((s, r) => s + r.amount, 0);
  const tenantExempt = exemptRows.reduce((s, r) => s + r.tenant, 0);
  const ownerExempt = exemptTotal - tenantExempt;

  // IVA
  let vatRate = safeNumber(bill.vatRate);
  let vatAmount = safeNumber(bill.vatAmount);
  if (vatRate <= 0 && vatAmount !== 0 && taxableTotal !== 0) {
    vatRate = (vatAmount / taxableTotal) * 100;
    warnings.push({
      level: 'info',
      code: 'vat-rate-derived',
      message: `Aliquota IVA ricavata dall'importo: ${fmt(vatRate)}%.`,
    });
  }
  if (vatAmount === 0 && vatRate > 0) {
    vatAmount = (taxableTotal * vatRate) / 100;
  }

  let tenantVat: number;
  if (vatMode === 'proportional') {
    tenantVat = taxableTotal !== 0 ? vatAmount * (tenantTaxable / taxableTotal) : 0;
  } else {
    tenantVat = (tenantTaxable * vatRate) / 100;
  }
  const ownerVat = vatAmount - tenantVat;

  const computedTotal = taxableTotal + exemptTotal + vatAmount;
  const billTotal = safeNumber(bill.totalAmount);
  const billDifference = billTotal - computedTotal;
  if (billTotal === 0) {
    warnings.push({ level: 'warning', code: 'missing-total', message: 'Totale della bolletta mancante.' });
  } else if (Math.abs(billDifference) > 0.5) {
    warnings.push({
      level: 'warning',
      code: 'total-mismatch',
      message: `La somma delle voci + IVA (${fmt(computedTotal)} €) differisce dal totale bolletta (${fmt(billTotal)} €) di ${fmt(billDifference)} €. Verifica le voci.`,
    });
  }

  const tenantRaw = tenantTaxable + tenantExempt + tenantVat;
  const tenantTotal = round2(tenantRaw);
  const reference = billTotal !== 0 ? billTotal : computedTotal;
  const ownerTotal = round2(round2(reference) - tenantTotal);

  return {
    rows,
    billKwh,
    tenantKwh,
    ownerKwh: Math.max(0, billKwh - tenantKwh),
    kwhPoolAmount,
    unitCost,
    tenantKwhCost,
    taxableTotal,
    tenantTaxable,
    ownerTaxable,
    exemptTotal,
    tenantExempt,
    ownerExempt,
    vat: { mode: vatMode, rate: vatRate, amount: vatAmount, tenant: tenantVat, owner: ownerVat },
    computedTotal,
    billTotal,
    billDifference,
    tenantRaw,
    tenantTotal,
    ownerTotal,
    warnings,
  };
}

/** Somma per categoria (IVA inclusa come voce separata) per il grafico a ciambella. */
export function billBreakdown(bill: ElectricityBill): { key: ElecCategory | 'iva'; label: string; value: number }[] {
  const totals = new Map<ElecCategory, number>();
  for (const l of bill.lines) {
    const sum = safeNumber(l.consumo) + safeNumber(l.fisso) + safeNumber(l.potenza);
    totals.set(l.category, (totals.get(l.category) ?? 0) + sum);
  }
  const out: { key: ElecCategory | 'iva'; label: string; value: number }[] = [];
  for (const [key, value] of totals) {
    if (value > 0) out.push({ key, label: CATEGORY_LABELS[key], value });
  }
  const vat = safeNumber(bill.vatAmount);
  if (vat > 0) out.push({ key: 'iva', label: 'IVA', value: vat });
  return out;
}
