import type { CalcSettings, Database, ElectricityBill, GasBill, MonthSnapshot, Payment, Reading } from '@/types';
import { computeElectricity, type CalcWarning, type ElectricityResult } from './electricity';
import { computeGas, type GasResult } from './gas';
import { monthsCoveredByReading, readingForMonth, tenantKwhForMonth } from './readings';
import { round2 } from './round';

export interface MonthSummary {
  month: string;
  reading: Reading | null;
  tenantKwh: number | null;
  electricityBill: ElectricityBill | null;
  gasBill: GasBill | null;
  electricity: ElectricityResult | null;
  gas: GasResult | null;
  tenantTotal: number;
  ownerTotal: number;
  payment: Payment;
  warnings: CalcWarning[];
}

const DAY = 86_400_000;

/** Verifica che la data della lettura cada nel periodo di fatturazione (tolleranza in giorni). */
export function checkPeriod(reading: Reading | null, bill: ElectricityBill | null, toleranceDays = 7): CalcWarning | null {
  if (!reading || !bill) return null;
  if (bill.periodStart && bill.periodEnd) {
    const d = Date.parse(reading.date);
    const s = Date.parse(bill.periodStart) - toleranceDays * DAY;
    const e = Date.parse(bill.periodEnd) + toleranceDays * DAY;
    if (Number.isFinite(d) && Number.isFinite(s) && Number.isFinite(e) && (d < s || d > e)) {
      return {
        level: 'warning',
        code: 'period-mismatch',
        message: `La data della lettura (${reading.date}) non rientra nel periodo della bolletta (${bill.periodStart} → ${bill.periodEnd}).`,
      };
    }
    return null;
  }
  return {
    level: 'info',
    code: 'period-missing',
    message: 'Periodo di fatturazione non indicato: impossibile verificare la coerenza con la lettura.',
  };
}

export function listMonths(db: Database): string[] {
  const set = new Set<string>();
  db.readings.filter((r) => !r.isInitial).forEach((r) => set.add(r.month));
  db.electricityBills.forEach((b) => set.add(b.month));
  db.gasBills.forEach((b) => set.add(b.month));
  return [...set].sort().reverse();
}

export function pickCalcSettings(s: CalcSettings): CalcSettings {
  return structuredClone({ allocation: s.allocation, vatMode: s.vatMode, gasTenantPercent: s.gasTenantPercent });
}

/**
 * Regole di calcolo da usare per un mese: quelle congelate al momento del pagamento,
 * altrimenti le impostazioni correnti. Così cambiare le impostazioni non altera i mesi già saldati.
 */
export function calcSettingsForMonth(db: Database, month: string): CalcSettings {
  const payment = db.payments[month];
  return payment?.paid && payment.calcSettings ? payment.calcSettings : db.settings;
}

/** Segna un mese come pagato congelando le regole di calcolo correnti (o lo riporta a "da pagare"). */
export function setMonthPaid(db: Database, month: string, paid: boolean, date: string): Database {
  const current = db.payments[month];
  db.payments[month] = paid
    ? {
        ...current,
        paid: true,
        date,
        calcSettings: current?.paid && current.calcSettings ? current.calcSettings : pickCalcSettings(db.settings),
      }
    : { paid: false };
  return db;
}

/**
 * Da chiamare PRIMA di sostituire le impostazioni: i mesi pagati senza regole congelate
 * (dati creati con versioni precedenti) ricevono le regole in vigore finora.
 */
export function freezePaidMonths(db: Database): Database {
  for (const [month, p] of Object.entries(db.payments)) {
    if (p.paid && !p.calcSettings) db.payments[month] = { ...p, calcSettings: pickCalcSettings(db.settings) };
  }
  return db;
}

export function buildMonthSummary(db: Database, month: string): MonthSummary {
  const settings = calcSettingsForMonth(db, month);
  const reading = readingForMonth(db.readings, month);
  const tenantKwh = tenantKwhForMonth(db.readings, month);
  const electricityBill = db.electricityBills.find((b) => b.month === month) ?? null;
  const gasBill = db.gasBills.find((b) => b.month === month) ?? null;
  const warnings: CalcWarning[] = [];

  let electricity: ElectricityResult | null = null;
  if (electricityBill) {
    if (tenantKwh === null) {
      warnings.push({
        level: 'error',
        code: 'missing-reading',
        message: `Manca la lettura del contascatti per questo mese: la quota a consumo di ${db.settings.tenantName} è calcolata con 0 kWh.`,
      });
    }
    electricity = computeElectricity({
      bill: electricityBill,
      tenantKwh: tenantKwh ?? 0,
      allocation: settings.allocation,
      vatMode: settings.vatMode,
      tenantName: db.settings.tenantName,
    });
    warnings.push(...electricity.warnings);
    const covered = monthsCoveredByReading(db.readings, month);
    if (covered !== null && covered > 1) {
      warnings.push({
        level: 'warning',
        code: 'reading-gap',
        message: `Manca la lettura di ${covered - 1 === 1 ? 'un mese precedente' : `${covered - 1} mesi precedenti`}: il consumo di questo mese (${tenantKwh} kWh) comprende ${covered} mesi, ma viene confrontato con una sola bolletta.`,
      });
    }
    const period = checkPeriod(reading, electricityBill);
    if (period) warnings.push(period);
  } else {
    warnings.push({ level: 'info', code: 'missing-elec-bill', message: 'Bolletta luce non ancora inserita.' });
  }

  let gas: GasResult | null = null;
  if (gasBill) {
    gas = computeGas(gasBill, settings.gasTenantPercent);
  } else {
    warnings.push({ level: 'info', code: 'missing-gas-bill', message: 'Bolletta gas non ancora inserita.' });
  }

  const tenantTotal = round2((electricity?.tenantTotal ?? 0) + (gas?.tenantTotal ?? 0));
  const ownerTotal = round2((electricity?.ownerTotal ?? 0) + (gas?.ownerTotal ?? 0));

  return {
    month,
    reading,
    tenantKwh,
    electricityBill,
    gasBill,
    electricity,
    gas,
    tenantTotal,
    ownerTotal,
    payment: db.payments[month] ?? { paid: false },
    warnings,
  };
}

export function buildAllSummaries(db: Database): MonthSummary[] {
  return listMonths(db).map((m) => buildMonthSummary(db, m));
}

export function buildSnapshots(db: Database): Record<string, MonthSnapshot> {
  const out: Record<string, MonthSnapshot> = {};
  const now = new Date().toISOString();
  for (const s of buildAllSummaries(db)) {
    out[s.month] = {
      month: s.month,
      tenantKwh: s.tenantKwh,
      billKwh: s.electricityBill?.totalKwh ?? null,
      electricityTenant: s.electricity?.tenantTotal ?? 0,
      electricityOwner: s.electricity?.ownerTotal ?? 0,
      gasTenant: s.gas?.tenantTotal ?? 0,
      gasOwner: s.gas?.ownerTotal ?? 0,
      total: s.tenantTotal,
      computedAt: now,
    };
  }
  return out;
}
