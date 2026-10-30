import { describe, expect, it } from 'vitest';
import type { BillLine, ElectricityBill } from '@/types';
import { computeElectricity } from './electricity';
import { defaultAllocation, normalizeDatabase } from './defaults';

/** Regola della prima versione: anche la quota a consumo del trasporto al 50%. I numeri dei test storici usano questa. */
function legacyAllocation() {
  const a = defaultAllocation();
  a.trasporto.consumo = { method: 'half', tenantPercent: 50 };
  return a;
}
import { computeGas } from './gas';
import { validateReading, withConsumption } from './readings';
import { round2 } from './round';

let seq = 0;
const line = (p: Partial<BillLine> & Pick<BillLine, 'category'>): BillLine => ({
  id: `l${++seq}`,
  label: '',
  consumo: 0,
  fisso: 0,
  potenza: 0,
  vatExempt: false,
  ...p,
});

/**
 * Bolletta mensile realistica (residente, 3 kW, IVA 10%), 300 kWh fatturati.
 *  - Materia energia: 60,00 € a consumo + 12,00 € quota fissa
 *  - Trasporto e contatore: 9,00 € consumo + 6,00 € fissa + 7,20 € potenza
 *  - Oneri di sistema: 15,00 € consumo + 4,00 € fissa
 *  - Accise: 6,81 €
 *  - Canone RAI: 9,00 € (esente IVA)
 *  Imponibile 120,01 € → IVA 12,00 € → Totale 141,01 €
 */
function baseBill(extra: BillLine[] = [], overrides: Partial<ElectricityBill> = {}): ElectricityBill {
  return {
    id: 'b1',
    month: '2026-03',
    periodStart: '2026-03-01',
    periodEnd: '2026-03-31',
    totalKwh: 300,
    totalAmount: 141.01,
    vatRate: 10,
    vatAmount: 12.0,
    lines: [
      line({ category: 'energia', label: 'Materia energia', consumo: 60, fisso: 12 }),
      line({ category: 'trasporto', label: 'Trasporto e contatore', consumo: 9, fisso: 6, potenza: 7.2 }),
      line({ category: 'oneri', label: 'Oneri di sistema', consumo: 15, fisso: 4 }),
      line({ category: 'accise', label: 'Accise', consumo: 6.81 }),
      line({ category: 'rai', label: 'Canone RAI', fisso: 9, vatExempt: true }),
      ...extra,
    ],
    createdAt: '2026-04-05T10:00:00Z',
    ...overrides,
  };
}

describe('computeElectricity', () => {
  it('caso standard: 120 kWh su 300, IVA 10% applicata all’imponibile dell’inquilino', () => {
    const res = computeElectricity({ bill: baseBill(), tenantKwh: 120, allocation: legacyAllocation(), vatMode: 'rate' });

    // Pool a consumo = 60 + 15 + 6,81 = 81,81 € → 0,2727 €/kWh
    expect(res.kwhPoolAmount).toBeCloseTo(81.81, 10);
    expect(res.unitCost).toBeCloseTo(0.2727, 10);
    expect(res.tenantKwhCost).toBeCloseTo(32.724, 10); // 120 × 0,2727

    // Voci al 50%: 12 + 9 + 6 + 7,2 + 4 = 38,2 → 19,10 all'inquilino
    expect(res.tenantTaxable).toBeCloseTo(32.724 + 19.1, 10);
    expect(res.vat.tenant).toBeCloseTo(5.1824, 10);
    expect(res.tenantExempt).toBeCloseTo(4.5, 10); // metà canone RAI

    // 51,824 + 5,1824 + 4,5 = 61,5064 → 61,51 €
    expect(res.tenantRaw).toBeCloseTo(61.5064, 10);
    expect(res.tenantTotal).toBe(61.51);
    expect(res.ownerTotal).toBe(79.5);
    expect(round2(res.tenantTotal + res.ownerTotal)).toBe(141.01);
    expect(res.warnings.filter((w) => w.level !== 'info')).toHaveLength(0);
  });

  it('regola personalizzata: trasporto al 50% anche sulla quota a consumo', () => {
    const res = computeElectricity({ bill: baseBill(), tenantKwh: 120, allocation: legacyAllocation(), vatMode: 'rate' });
    const transport = res.rows.filter((r) => r.category === 'trasporto');
    expect(transport).toHaveLength(3);
    transport.forEach((r) => {
      expect(r.method).toBe('half');
      expect(r.tenant).toBeCloseTo(r.amount / 2, 10);
    });
  });

  it('conguaglio a credito (-20 €) diviso al 50% di default', () => {
    const bill = baseBill([line({ category: 'altre', label: 'Conguaglio letture', consumo: -20 })], {
      totalAmount: 119.01,
      vatAmount: 10.0,
    });
    const res = computeElectricity({ bill, tenantKwh: 120, allocation: legacyAllocation(), vatMode: 'rate' });
    // Imponibile inquilino = 51,824 − 10 = 41,824 → IVA 4,1824 → + RAI 4,5 = 50,5064
    expect(res.tenantRaw).toBeCloseTo(50.5064, 10);
    expect(res.tenantTotal).toBe(50.51);
    expect(res.ownerTotal).toBe(68.5);
  });

  it('conguaglio configurato come proporzionale ai kWh entra nel costo unitario', () => {
    const allocation = legacyAllocation();
    allocation.altre.consumo = { method: 'kwh', tenantPercent: 50 };
    const bill = baseBill([line({ category: 'altre', label: 'Conguaglio', consumo: -20 })], {
      totalAmount: 119.01,
      vatAmount: 10.0,
    });
    const res = computeElectricity({ bill, tenantKwh: 120, allocation, vatMode: 'rate' });
    // Pool = 81,81 − 20 = 61,81 → 0,206033 €/kWh → 24,724 € all'inquilino
    expect(res.unitCost).toBeCloseTo(61.81 / 300, 10);
    expect(res.tenantKwhCost).toBeCloseTo(24.724, 10);
    expect(res.tenantTotal).toBe(52.71); // (24,724 + 19,1) × 1,10 + 4,5 = 52,7064
  });

  it('inquilino a consumo zero: paga solo le quote fisse al 50%', () => {
    const res = computeElectricity({ bill: baseBill(), tenantKwh: 0, allocation: legacyAllocation(), vatMode: 'rate' });
    expect(res.tenantKwhCost).toBe(0);
    // 19,10 + IVA 1,91 + RAI 4,50 = 25,51
    expect(res.tenantTotal).toBe(25.51);
    expect(res.ownerTotal).toBe(115.5);
    res.rows.filter((r) => r.method === 'kwh').forEach((r) => expect(r.tenant).toBe(0));
  });

  it('IVA proporzionale all’imponibile dà lo stesso risultato quando l’IVA è coerente', () => {
    const res = computeElectricity({ bill: baseBill(), tenantKwh: 120, allocation: legacyAllocation(), vatMode: 'proportional' });
    expect(res.vat.tenant).toBeCloseTo(12 * (51.824 / 120.01), 10);
    expect(res.tenantTotal).toBe(61.51);
  });

  it('regole personalizzate ed escluse', () => {
    const allocation = legacyAllocation();
    allocation.trasporto.consumo = { method: 'custom', tenantPercent: 30 };
    allocation.rai.fisso = { method: 'excluded', tenantPercent: 0 };
    const res = computeElectricity({ bill: baseBill(), tenantKwh: 120, allocation, vatMode: 'rate' });
    // Rispetto al caso standard: trasporto consumo 2,70 invece di 4,50 (−1,80 imponibile), RAI 0 invece di 4,50
    const expected = (32.724 + 19.1 - 1.8) * 1.1;
    expect(res.tenantRaw).toBeCloseTo(expected, 10);
    expect(res.tenantTotal).toBe(round2(expected));
    expect(res.tenantExempt).toBe(0);
  });

  it('segnala kWh inquilino superiori ai kWh in bolletta e totale incoerente', () => {
    const res = computeElectricity({
      bill: baseBill([], { totalAmount: 150 }),
      tenantKwh: 350,
      allocation: legacyAllocation(),
      vatMode: 'rate',
    });
    const codes = res.warnings.map((w) => w.code);
    expect(codes).toContain('tenant-exceeds-bill');
    expect(codes).toContain('total-mismatch');
  });

  it('kWh inquilino oltre la bolletta: quota a consumo limitata al 100%, mai quota proprietario negativa', () => {
    const res = computeElectricity({ bill: baseBill(), tenantKwh: 350, allocation: legacyAllocation(), vatMode: 'rate' });
    res.rows
      .filter((r) => r.method === 'kwh')
      .forEach((r) => {
        expect(r.tenantRatio).toBe(1);
        expect(r.owner).toBeCloseTo(0, 10);
      });
    expect(res.tenantKwhCost).toBeCloseTo(81.81, 10);
    // (81,81 + 19,10) × 1,10 + 4,50 = 115,501
    expect(res.tenantTotal).toBe(115.5);
    expect(res.ownerTotal).toBe(25.51);
    expect(res.warnings.map((w) => w.code)).toContain('tenant-exceeds-bill');
  });

  it('kWh della bolletta mancanti: errore e nessuna quota a consumo', () => {
    const res = computeElectricity({
      bill: baseBill([], { totalKwh: 0 }),
      tenantKwh: 100,
      allocation: legacyAllocation(),
      vatMode: 'rate',
    });
    expect(res.unitCost).toBeNull();
    expect(res.warnings.map((w) => w.code)).toContain('missing-bill-kwh');
  });
});

/**
 * Bolletta luce E.ON reale (settembre 2026, 787,79 kWh, totale da pagare 179,00 €), solo importi.
 * Regole: quote a consumo in base ai kWh reali, quote fisse e potenza a metà.
 */
function eonBill(): ElectricityBill {
  return {
    id: 'eon',
    month: '2026-09',
    periodStart: '2026-09-01',
    periodEnd: '2026-09-30',
    totalKwh: 787.79,
    totalAmount: 179,
    vatRate: 10,
    vatAmount: 15.46,
    lines: [
      line({ category: 'energia', consumo: 76.13, fisso: 9.09 }),
      line({ category: 'trasporto', consumo: 11.6, fisso: 1.92, potenza: 11.86 }),
      line({ category: 'oneri', consumo: 26.11 }),
      line({ category: 'accise', consumo: 17.88 }),
      line({ category: 'rai', fisso: 9, vatExempt: true }),
      line({ category: 'altre', consumo: -0.05, vatExempt: true }), // arrotondamento fuori campo IVA
    ],
    createdAt: '2026-10-16T00:00:00Z',
  };
}

describe('bolletta E.ON reale con le regole predefinite', () => {
  it('le voci tornano al totale da pagare', () => {
    const res = computeElectricity({ bill: eonBill(), tenantKwh: 200, allocation: defaultAllocation(), vatMode: 'rate' });
    expect(round2(res.computedTotal)).toBe(179);
    expect(res.warnings.filter((w) => w.level !== 'info')).toHaveLength(0);
  });

  it('inquilino 200 kWh: consumi in proporzione, quote fisse e potenza a metà', () => {
    const res = computeElectricity({ bill: eonBill(), tenantKwh: 200, allocation: defaultAllocation(), vatMode: 'rate' });
    // Consumi: energia 76,13 + trasporto 11,60 + oneri 26,11 + accise 17,88 = 131,72 € su 787,79 kWh
    expect(res.kwhPoolAmount).toBeCloseTo(131.72, 10);
    expect(res.tenantKwhCost).toBeCloseTo((131.72 * 200) / 787.79, 10); // 33,44 €
    // Quote fisse e potenza: 9,09 + 1,92 + 11,86 = 22,87 € → 11,435 €
    // IVA 10% sull'imponibile dell'inquilino; canone RAI e arrotondamento a metà, senza IVA
    const expected = ((131.72 * 200) / 787.79 + 22.87 / 2) * 1.1 + 9 / 2 - 0.05 / 2;
    expect(res.tenantRaw).toBeCloseTo(expected, 10);
    expect(res.tenantTotal).toBe(53.84);
    expect(res.ownerTotal).toBe(125.16);
  });

  it('il trasporto a consumo segue i kWh reali', () => {
    const res = computeElectricity({ bill: eonBill(), tenantKwh: 200, allocation: defaultAllocation(), vatMode: 'rate' });
    const row = res.rows.find((r) => r.category === 'trasporto' && r.component === 'consumo')!;
    expect(row.method).toBe('kwh');
    expect(row.tenantRatio).toBeCloseTo(200 / 787.79, 10);
  });

  it('database creati con la versione precedente: il trasporto a consumo passa ai kWh', () => {
    const old = { schemaVersion: 1, settings: { allocation: legacyAllocation() } };
    expect(normalizeDatabase(old).settings.allocation.trasporto.consumo.method).toBe('kwh');
    // Una scelta fatta dopo la migrazione viene rispettata
    const v2 = { schemaVersion: 2, settings: { allocation: legacyAllocation() } };
    expect(normalizeDatabase(v2).settings.allocation.trasporto.consumo.method).toBe('half');
  });
});

describe('computeGas', () => {
  it('35% del totale arrotondato al centesimo', () => {
    const res = computeGas({ totalAmount: 87.4 }, 35);
    expect(res.tenantTotal).toBe(30.59); // 30,59
    expect(res.ownerTotal).toBe(56.81);
  });
  it('bolletta gas E.ON reale: 46,00 € → 16,10 € inquilino, 29,90 € proprietario', () => {
    const res = computeGas({ totalAmount: 46 }, 35);
    expect(res.tenantTotal).toBe(16.1);
    expect(res.ownerTotal).toBe(29.9);
  });
  it('percentuale personalizzata', () => {
    expect(computeGas({ totalAmount: 100 }, 40).tenantTotal).toBe(40);
  });
});

describe('letture contascatti', () => {
  const readings = [
    { id: 'i', month: '2026-01', date: '2026-01-31', value: 1000, isInitial: true },
    { id: 'a', month: '2026-02', date: '2026-02-28', value: 1100, isInitial: false },
    { id: 'b', month: '2026-03', date: '2026-03-31', value: 1210, isInitial: false },
  ];

  it('calcola il consumo come differenza con la lettura precedente', () => {
    const rows = withConsumption(readings);
    expect(rows.map((r) => r.consumption)).toEqual([null, 100, 110]);
  });

  it('rifiuta letture inferiori alla precedente', () => {
    const v = validateReading(readings, { month: '2026-04', date: '2026-04-30', value: 1200 });
    expect(v.errors.length).toBeGreaterThan(0);
  });

  it('segnala consumi anomali (> +50% della media)', () => {
    const v = validateReading(readings, { month: '2026-04', date: '2026-04-30', value: 1400 });
    expect(v.consumption).toBe(190);
    expect(v.errors).toHaveLength(0);
    expect(v.warnings.length).toBe(1);
  });
});
