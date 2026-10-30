import { describe, expect, it } from 'vitest';
import type { Database, ElectricityBill } from '@/types';
import { emptyDatabase, normalizeDatabase } from './defaults';
import { buildAllSummaries } from './summary';
import { electricitySplitByMonth, gasSplitByMonth, splitByYear, splitTotals } from './split';

/** Bolletta luce semplice: 300 kWh, solo voci a consumo (100 €) e quota fissa (20 €), senza IVA. */
function elecBill(month: string): ElectricityBill {
  return {
    id: `e-${month}`,
    month,
    totalKwh: 300,
    totalAmount: 120,
    vatRate: 0,
    vatAmount: 0,
    lines: [{ id: `l-${month}`, category: 'energia', label: '', consumo: 100, fisso: 20, potenza: 0, vatExempt: false }],
    createdAt: '',
  };
}

function db(): Database {
  const d = emptyDatabase();
  d.readings = [
    { id: 'i', month: '2025-11', date: '2025-11-30', value: 1000, isInitial: true },
    { id: 'a', month: '2025-12', date: '2025-12-31', value: 1100, isInitial: false }, // 100 kWh
    { id: 'b', month: '2026-01', date: '2026-01-31', value: 1250, isInitial: false }, // 150 kWh
  ];
  d.electricityBills = [elecBill('2025-12'), elecBill('2026-01')];
  d.gasBills = [
    { id: 'g1', month: '2025-12', smc: 100, totalAmount: 80, createdAt: '' },
    { id: 'g2', month: '2026-01', smc: 40, totalAmount: 40, createdAt: '' },
  ];
  return d;
}

describe('consumi e spese per persona', () => {
  it('luce: kWh dal contascatti per chi paga la quota, il resto all’altra persona', () => {
    const points = electricitySplitByMonth(buildAllSummaries(db()));
    expect(points.map((p) => p.period)).toEqual(['2025-12', '2026-01']);
    expect(points[0]).toMatchObject({ tenantQty: 100, ownerQty: 200 });
    // 100 € × 100/300 + 20 € / 2 = 43,33 € · resto 76,67 €
    expect(points[0].tenantEur).toBe(43.33);
    expect(points[0].ownerEur).toBe(76.67);
    expect(points[1]).toMatchObject({ tenantQty: 150, ownerQty: 150, tenantEur: 60, ownerEur: 60 });
  });

  it('gas: Smc attribuiti con la percentuale concordata (35%)', () => {
    const points = gasSplitByMonth(buildAllSummaries(db()));
    expect(points[0].tenantQty).toBeCloseTo(35, 10);
    expect(points[0].ownerQty).toBeCloseTo(65, 10);
    expect(points[0]).toMatchObject({ tenantEur: 28, ownerEur: 52 });
  });

  it('vista annuale: somma dei mesi per anno', () => {
    const years = splitByYear(gasSplitByMonth(buildAllSummaries(db())));
    expect(years.map((y) => y.period)).toEqual(['2025', '2026']);
    expect(years[1].tenantQty).toBeCloseTo(14, 10);
    const all = splitTotals(electricitySplitByMonth(buildAllSummaries(db())));
    expect(all.tenantQty).toBe(250);
    expect(all.ownerQty).toBe(350);
    expect(Math.round((all.tenantEur + all.ownerEur) * 100) / 100).toBe(240);
  });
});

describe('nomi', () => {
  it('i nomi segnaposto della prima versione diventano Ester e Marco', () => {
    const migrated = normalizeDatabase({ schemaVersion: 2, settings: { tenantName: 'Inquilino', ownerName: 'Proprietario' } });
    expect(migrated.settings.tenantName).toBe('Ester');
    expect(migrated.settings.ownerName).toBe('Marco');
  });
  it('nomi scelti a mano non vengono toccati', () => {
    const custom = normalizeDatabase({ schemaVersion: 2, settings: { tenantName: 'Anna', ownerName: 'Luca' } });
    expect(custom.settings).toMatchObject({ tenantName: 'Anna', ownerName: 'Luca' });
  });
});
