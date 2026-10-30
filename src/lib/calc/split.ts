import type { MonthSummary } from './summary';

/** Consumo e spesa di ciascuna persona in un periodo (mese o anno). */
export interface SplitPoint {
  /** AAAA-MM per i mesi, AAAA per gli anni */
  period: string;
  tenantQty: number;
  ownerQty: number;
  tenantEur: number;
  ownerEur: number;
}

/**
 * Luce, per mese: kWh dal contascatti per chi paga la quota, il resto dei kWh in bolletta all'altra persona;
 * spesa = quote calcolate. Solo i mesi con una bolletta luce.
 */
export function electricitySplitByMonth(summaries: MonthSummary[]): SplitPoint[] {
  return summaries
    .filter((s) => s.electricity)
    .map((s) => {
      const e = s.electricity!;
      const tenantQty = Math.min(s.tenantKwh ?? 0, e.billKwh);
      return {
        period: s.month,
        tenantQty,
        ownerQty: Math.max(0, e.billKwh - tenantQty),
        tenantEur: e.tenantTotal,
        ownerEur: e.ownerTotal,
      };
    })
    .sort((a, b) => a.period.localeCompare(b.period));
}

/**
 * Gas, per mese. Non esiste un contatore separato: gli Smc vengono attribuiti con la stessa percentuale
 * concordata per la spesa (es. 35% / 65%). Solo i mesi con una bolletta gas.
 */
export function gasSplitByMonth(summaries: MonthSummary[]): SplitPoint[] {
  return summaries
    .filter((s) => s.gas && s.gasBill)
    .map((s) => {
      const g = s.gas!;
      const smc = Math.max(0, s.gasBill!.smc || 0);
      const tenantQty = (smc * g.percent) / 100;
      return {
        period: s.month,
        tenantQty,
        ownerQty: smc - tenantQty,
        tenantEur: g.tenantTotal,
        ownerEur: g.ownerTotal,
      };
    })
    .sort((a, b) => a.period.localeCompare(b.period));
}

/** Somma i punti mensili per anno. */
export function splitByYear(points: SplitPoint[]): SplitPoint[] {
  const years = new Map<string, SplitPoint>();
  for (const p of points) {
    const year = p.period.slice(0, 4);
    const acc = years.get(year) ?? { period: year, tenantQty: 0, ownerQty: 0, tenantEur: 0, ownerEur: 0 };
    acc.tenantQty += p.tenantQty;
    acc.ownerQty += p.ownerQty;
    acc.tenantEur += p.tenantEur;
    acc.ownerEur += p.ownerEur;
    years.set(year, acc);
  }
  return [...years.values()].sort((a, b) => a.period.localeCompare(b.period));
}

/** Totali di un insieme di punti. */
export function splitTotals(points: SplitPoint[]): Omit<SplitPoint, 'period'> {
  return points.reduce(
    (t, p) => ({
      tenantQty: t.tenantQty + p.tenantQty,
      ownerQty: t.ownerQty + p.ownerQty,
      tenantEur: t.tenantEur + p.tenantEur,
      ownerEur: t.ownerEur + p.ownerEur,
    }),
    { tenantQty: 0, ownerQty: 0, tenantEur: 0, ownerEur: 0 },
  );
}
